import type { INestApplication } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import type { App } from "supertest/types.js";
import { ExecuteTableCommand } from "@/modules/table/application/commands/execute-table-command/execute-table-command.command.js";
import type { TableStreamEvent } from "@/modules/table/application/game-streams.js";
import { TableLeases } from "@/modules/table/application/table-leases.js";
import { EventStore } from "@/shared/application/event-store.js";
import { DomainError } from "@/shared/domain/domain-error.js";
import { REDIS, type Redis } from "@/shared/infrastructure/redis/index.js";
import { captureLogs } from "./support/capture-logs.js";
import { createTestApp } from "./support/create-test-app.js";
import { tableConfig } from "./support/table.js";
import {
	createTestDatabase,
	type TestDatabase,
} from "./support/test-database.js";

const LEASE_TTL_MS = 1_000;

/** Two api instances on one database and one Redis, with short leases (ADR-004, POK-79, POK-80). */
describe("Table leases and failover (e2e)", () => {
	let database: TestDatabase;
	let a: INestApplication<App>;
	let b: INestApplication<App>;
	let store: EventStore<TableStreamEvent>;

	const boot = () =>
		createTestApp({
			config: {
				database: { url: database.url },
				table: { handPauseMs: 50, leaseTtlMs: LEASE_TTL_MS },
			},
		});

	beforeAll(async () => {
		database = await createTestDatabase();
		a = await boot();
		b = await boot();
		store = a.get(EventStore, { strict: false });
	});

	afterAll(async () => {
		await Promise.all([a, b].map((app) => app?.close()));
		await database?.drop();
	});

	const send = (app: INestApplication, tableId: string, command: object) =>
		app
			.get(CommandBus)
			.execute(new ExecuteTableCommand(tableId, command as never));
	const stream = async (tableId: string) =>
		await store.readStream(`table-${tableId}`);
	const epochsOf = async (tableId: string) =>
		(await stream(tableId)).map(({ metadata }) => metadata.leaseEpoch);
	const openOn = async (
		app: INestApplication,
		tableId: string,
		config = tableConfig(),
	) => send(app, tableId, { type: "OpenTable", tableId, config });

	it("runs a command sent to another instance on the one holding the table", async () => {
		const tableId = crypto.randomUUID();
		await openOn(a, tableId);

		await send(b, tableId, { type: "JoinAsSpectator", userId: "s1" });

		expect(await a.get(TableLeases).ownerOf(tableId)).toBe(
			a.get(TableLeases).instanceId,
		);
		const epochs = await epochsOf(tableId);
		expect(new Set(epochs).size).toBe(1);
		expect(epochs).toHaveLength(2);
	});

	it("never lets two instances write a table at once, even when its lease is forced to expire", async () => {
		const tableId = crypto.randomUUID();
		await openOn(a, tableId);
		const redis = a.get<Redis>(REDIS);

		// Commands from both instances, while the lease is taken away from its holder twice.
		const outcomes = await Promise.allSettled(
			Array.from({ length: 40 }, async (_, index) => {
				if (index % 15 === 7) {
					await redis.del(`${database.name}:table:${tableId}:owner`);
				}
				return send(index % 2 ? a : b, tableId, {
					type: "JoinAsSpectator",
					userId: `s${index}`,
				});
			}),
		);

		// A command may be refused while the table changes hands, and is sent again; never for
		// anything else. Until the new holder's first write, the old one's writes still count.
		const handover = [
			"table.moved",
			"table.unavailable",
			"event-store.version-conflict",
		];
		for (const outcome of outcomes) {
			if (outcome.status === "rejected") {
				expect(outcome.reason).toBeInstanceOf(DomainError);
				expect(handover).toContain((outcome.reason as DomainError).code);
			}
		}
		const recorded = await stream(tableId);
		expect(recorded.map(({ version }) => version)).toEqual(
			recorded.map((_, index) => index + 1),
		);
		// Every holder wrote only after the previous one: epochs never go back down.
		const epochs = recorded.map(({ metadata }) => metadata.leaseEpoch ?? 0);
		expect(epochs).toEqual(epochs.toSorted((x, y) => x - y));
		expect(new Set(epochs).size).toBeGreaterThan(1);
		// The spectators who got in are each there once.
		const joined = recorded.filter(
			({ event }) => event.type === "SpectatorJoined",
		);
		expect(joined.length).toBe(
			outcomes.filter((outcome) => outcome.status === "fulfilled").length,
		);
		// The table is still in play, on its current holder.
		await send(a, tableId, { type: "JoinAsSpectator", userId: "last" });
		expect((await stream(tableId)).at(-1)?.event.type).toBe("SpectatorJoined");
	});

	it("takes a table over when its holder stops mid-hand, and the hand ends with every chip", async () => {
		const tableId = crypto.randomUUID();
		const { lines } = captureLogs();
		// 5 s a turn and no time bank: the hand ends by timeouts once nobody acts.
		const victim = await boot();
		await openOn(
			victim,
			tableId,
			tableConfig({ turnSeconds: 5, timeBankSeconds: 0 }),
		);
		for (const seat of [0, 1]) {
			await send(victim, tableId, {
				type: "TakeSeat",
				userId: `u${seat}`,
				verified: true,
				seat,
				buyIn: 200,
			});
		}
		await vi.waitFor(async () =>
			expect((await stream(tableId)).map(({ event }) => event.type)).toContain(
				"HandScheduled",
			),
		);

		// The holder stops without letting go of anything, as `kill -9` would.
		const leases = victim.get(TableLeases);
		vi.spyOn(leases, "release").mockResolvedValue();
		vi.spyOn(leases, "renew").mockResolvedValue(true);
		await victim.close();

		// Another instance takes it over within the lease's time, and the hand plays out.
		await vi.waitFor(
			async () =>
				expect(
					(await stream(tableId)).map(({ event }) => event.type),
				).toContain("HandSettled"),
			{ timeout: 15_000, interval: 200 },
		);
		const takeover = lines.find(
			(line) => line.msg === "table taken over" && line.tableId === tableId,
		);
		expect(takeover).toMatchObject({ epoch: 2 });
		expect(Number(takeover?.sinceLastEventMs)).toBeLessThan(
			LEASE_TTL_MS * 3 + 1_000,
		);

		const settled = (await stream(tableId)).find(
			({ event }) => event.type === "HandSettled",
		)?.event;
		const stacks =
			settled?.type === "HandSettled"
				? settled.stacks.map(({ stack }) => stack)
				: [];
		expect(stacks.reduce((sum, stack) => sum + stack, 0)).toBe(400);
	}, 30_000);
});
