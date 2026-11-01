import type { EventBus } from "@nestjs/cqrs";
import { InMemoryEventStore } from "../../../../../test/support/in-memory-event-store.js";
import { tableConfig } from "../../../../../test/support/table.js";
import {
	FixedDeckProvider,
	FixedUnfinishedTables,
	InMemoryLeaseStore,
	InMemoryRequestBus,
} from "../../../../../test/support/table-ports.js";
import { Clock } from "@/shared/application/clock.js";
import { TableChanged } from "../events/table-changed.event.js";
import type { TableStreamEvent } from "../game-streams.js";
import { TableRuntimeRegistry } from "./table-runtime-registry.js";

class FakeClock extends Clock {
	ms = 0;

	now(): Date {
		return new Date(this.ms);
	}
}

const IDLE_MS = 10 * 60_000;
const LEASE_TTL_MS = 10_000;

/** A cluster of api instances on one event store, one lease store and one request bus. */
function cluster({
	unfinished = [] as string[],
	/** Long enough for a test that moves the clock past it without renewing. */
	leaseTtlMs = LEASE_TTL_MS,
} = {}) {
	const store = new InMemoryEventStore<TableStreamEvent>();
	const clock = new FakeClock();
	const leases = new InMemoryLeaseStore(leaseTtlMs, () => clock.ms);
	const bus = new InMemoryRequestBus();
	const instance = (instanceId: string) => {
		const published: TableChanged[] = [];
		const eventBus = {
			publish: (event: TableChanged) => published.push(event),
		} as unknown as EventBus;
		const registry = new TableRuntimeRegistry(
			store,
			new FixedDeckProvider(),
			eventBus,
			{ handPauseMs: 3_000, idleMs: IDLE_MS, leaseTtlMs: LEASE_TTL_MS },
			clock,
			leases.forInstance(instanceId),
			bus.forInstance(instanceId),
			new FixedUnfinishedTables(unfinished),
		);
		registry.onApplicationBootstrap();
		return { instanceId, registry, published };
	};
	return { store, clock, leases, bus, instance };
}

const open = (registry: TableRuntimeRegistry, tableId: string) =>
	registry.execute(tableId, {
		type: "OpenTable",
		tableId,
		config: tableConfig(),
	});
const takeSeat = (
	registry: TableRuntimeRegistry,
	tableId: string,
	seat: number,
) =>
	registry.execute(tableId, {
		type: "TakeSeat",
		userId: `u${seat}`,
		verified: true,
		seat,
		buyIn: 200,
	});

describe("TableRuntimeRegistry", () => {
	const registries: TableRuntimeRegistry[] = [];
	const track = <T extends { registry: TableRuntimeRegistry }>(made: T) => {
		registries.push(made.registry);
		return made;
	};

	afterEach(async () => {
		await Promise.all(registries.map((r) => r.onApplicationShutdown()));
		registries.length = 0;
		vi.useRealTimers();
	});

	it("runs a table where its first command came, holding its lease, and publishes its changes there", async () => {
		const { leases, instance } = cluster();
		const a = track(instance("a"));

		await open(a.registry, "t-1");

		expect(a.registry.size).toBe(1);
		expect(leases.current("t-1")).toMatchObject({ instanceId: "a", epoch: 1 });
		expect(a.published).toEqual([expect.any(TableChanged)]);
	});

	it("sends a command for a table another instance runs to that one", async () => {
		const { store, instance } = cluster();
		const a = track(instance("a"));
		const b = track(instance("b"));
		await open(a.registry, "t-1");

		await b.registry.execute("t-1", { type: "JoinAsSpectator", userId: "s1" });
		const view = await b.registry.viewFor("t-1", "s1");

		expect(b.registry.size).toBe(0);
		expect(view.spectatorCount).toBe(1);
		// Run, stored and published by the instance that runs the table, fenced with its epoch.
		expect(a.published).toHaveLength(2);
		expect(b.published).toEqual([]);
		const stream = await store.readStream("table-t-1");
		expect(stream.map(({ metadata }) => metadata.leaseEpoch)).toEqual([1, 1]);
	});

	it("answers the holder's refusals as the table's own", async () => {
		const { instance } = cluster();
		const a = track(instance("a"));
		const b = track(instance("b"));
		await open(a.registry, "t-1");

		await expect(
			b.registry.execute("t-1", { type: "SitIn", userId: "nobody" }),
		).rejects.toMatchObject({
			code: "table.not-seated",
			kind: "rule-violation",
		});
	});

	it("takes over a table whose holder stopped, once its lease runs out, and fences the old holder off", async () => {
		const { store, leases, bus, instance } = cluster();
		const a = track(instance("a"));
		const b = track(instance("b"));
		await open(a.registry, "t-1");

		// a stops answering, and its lease runs out.
		bus.stopped.add("a");
		await expect(
			b.registry.execute("t-1", { type: "JoinAsSpectator", userId: "s1" }),
		).rejects.toMatchObject({ code: "table.unavailable" });
		leases.expire("t-1");
		await b.registry.adoptOrphans();

		expect(b.registry.size).toBe(1);
		expect(leases.current("t-1")).toMatchObject({ instanceId: "b", epoch: 2 });
		await b.registry.execute("t-1", { type: "JoinAsSpectator", userId: "s1" });

		// a still believes it runs the table, until it writes: fenced off, it lets the table go,
		// and sends the command to b instead.
		await a.registry.execute("t-1", { type: "JoinAsSpectator", userId: "s2" });
		expect(a.registry.size).toBe(0);
		const stream = await store.readStream("table-t-1");
		expect(stream.map(({ metadata }) => metadata.leaseEpoch)).toEqual([
			1, 2, 2,
		]);
		expect(a.published).toHaveLength(1);
		expect(b.published).toHaveLength(2);
	});

	it("stops a runtime whose lease another instance took, at its next renewal", async () => {
		const { leases, instance } = cluster();
		const a = track(instance("a"));
		const b = track(instance("b"));
		await open(a.registry, "t-1");

		leases.expire("t-1");
		await b.registry.viewFor("t-1", "s1");
		await a.registry.renewLeases();

		expect(a.registry.size).toBe(0);
		expect(b.registry.size).toBe(1);
	});

	it("renews the leases it holds, so they never run out while it runs", async () => {
		const { clock, leases, instance } = cluster();
		const a = track(instance("a"));
		await open(a.registry, "t-1");

		for (let step = 0; step < 5; step++) {
			clock.ms += LEASE_TTL_MS / 2;
			await a.registry.renewLeases();
		}

		expect(leases.current("t-1")).toMatchObject({ instanceId: "a" });
	});

	it("takes up tables with an unfinished hand when it starts, and deals on", async () => {
		vi.useFakeTimers();
		const { store, instance } = cluster({ unfinished: ["t-1"] });
		const a = track(instance("a"));
		await open(a.registry, "t-1");
		await takeSeat(a.registry, "t-1", 0);
		await takeSeat(a.registry, "t-1", 1);
		// a stops without releasing anything, before the deal.
		await a.registry.onApplicationShutdown();

		const b = track(instance("b"));
		await vi.advanceTimersByTimeAsync(LEASE_TTL_MS);
		await vi.advanceTimersByTimeAsync(3_000);

		expect(b.registry.size).toBe(1);
		const types = (await store.readStream("table-t-1")).map(
			({ event }) => event.type,
		);
		expect(types).toContain("HandScheduled");
	});

	it("drops runtimes idle for long enough and releases their leases", async () => {
		const { clock, leases, instance } = cluster({ leaseTtlMs: IDLE_MS * 2 });
		const a = track(instance("a"));
		await open(a.registry, "t-1");
		clock.ms = 1_000;
		await open(a.registry, "t-2");

		clock.ms = IDLE_MS;
		expect(a.registry.evictIdle()).toBe(1);
		await vi.waitFor(() => expect(leases.leased.has("t-1")).toBe(false));
		expect(a.registry.size).toBe(1);
	});

	it("keeps a runtime that has a hand to deal", async () => {
		vi.useFakeTimers();
		const { clock, instance } = cluster();
		const a = track(instance("a"));
		await open(a.registry, "t-1");
		await takeSeat(a.registry, "t-1", 0);
		await takeSeat(a.registry, "t-1", 1);

		clock.ms = IDLE_MS * 2;
		expect(a.registry.evictIdle()).toBe(0);
	});

	it("lets queued commands finish on shutdown, then releases what it held", async () => {
		const { store, leases, instance } = cluster();
		const a = instance("a");
		const opened = open(a.registry, "t-1");

		await opened;
		await a.registry.onApplicationShutdown();

		expect(await store.readStream("table-t-1")).toHaveLength(1);
		expect(a.registry.size).toBe(0);
		expect(leases.current("t-1")).toBeUndefined();
	});
});
