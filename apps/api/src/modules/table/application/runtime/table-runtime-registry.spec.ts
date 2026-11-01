import type { EventBus } from "@nestjs/cqrs";
import { InMemoryEventStore } from "../../../../../test/support/in-memory-event-store.js";
import { tableConfig } from "../../../../../test/support/table.js";
import { FixedDeckProvider } from "../../../../../test/support/table-ports.js";
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

function setUp() {
	const store = new InMemoryEventStore<TableStreamEvent>();
	const published: unknown[] = [];
	const eventBus = {
		publish: (event: unknown) => published.push(event),
	} as unknown as EventBus;
	const clock = new FakeClock();
	const registry = new TableRuntimeRegistry(
		store,
		new FixedDeckProvider(),
		eventBus,
		{ handPauseMs: 3_000, idleMs: IDLE_MS },
		clock,
	);
	const open = (tableId: string) =>
		registry
			.get(tableId)
			.execute({ type: "OpenTable", tableId, config: tableConfig() });
	return { store, published, clock, registry, open };
}

describe("TableRuntimeRegistry", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("keeps one runtime per table, publishing its changes on the event bus", async () => {
		const { published, registry, open } = setUp();

		expect(registry.get("t-1")).toBe(registry.get("t-1"));
		expect(registry.get("t-2")).not.toBe(registry.get("t-1"));
		await open("t-1");

		expect(registry.size).toBe(2);
		expect(published).toEqual([expect.any(TableChanged)]);
	});

	it("drops runtimes idle for long enough, and reloads a table on its next command", async () => {
		const { store, clock, registry, open } = setUp();
		await open("t-1");
		clock.ms = 1_000;
		await open("t-2");

		clock.ms = IDLE_MS;
		expect(registry.evictIdle()).toBe(1);
		expect(registry.size).toBe(1);

		const reads = vi.spyOn(store, "readStream");
		await expect(
			registry.get("t-1").execute({ type: "JoinAsSpectator", userId: "s1" }),
		).resolves.toMatchObject({ table: [{ type: "SpectatorJoined" }] });
		expect(reads).toHaveBeenCalledWith("table-t-1");
	});

	it("keeps a runtime that is busy, or has a hand to deal", async () => {
		vi.useFakeTimers();
		const { clock, registry, open } = setUp();
		await open("t-1");
		for (const seat of [0, 1]) {
			await registry.get("t-1").execute({
				type: "TakeSeat",
				userId: `u${seat}`,
				verified: true,
				seat,
				buyIn: 200,
			});
		}

		clock.ms = IDLE_MS * 2;
		expect(registry.evictIdle()).toBe(0);
	});

	it("sweeps for idle runtimes on a timer once started", async () => {
		vi.useFakeTimers();
		const { clock, registry, open } = setUp();
		registry.onModuleInit();
		await open("t-1");

		clock.ms = IDLE_MS;
		await vi.advanceTimersByTimeAsync(60_000);

		expect(registry.size).toBe(0);
		await registry.onApplicationShutdown();
	});

	it("lets queued commands finish on shutdown, then holds no runtime", async () => {
		const { store, registry, open } = setUp();
		const opened = open("t-1");

		await registry.onApplicationShutdown();

		await expect(opened).resolves.toBeDefined();
		expect(await store.readStream("table-t-1")).toHaveLength(1);
		expect(registry.size).toBe(0);
	});
});
