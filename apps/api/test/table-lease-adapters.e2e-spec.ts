import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import type { App } from "supertest/types.js";
import type { TableStreamEvent } from "@/modules/table/application/game-streams.js";
import { TableLeases } from "@/modules/table/application/table-leases.js";
import { UnfinishedTables } from "@/modules/table/application/unfinished-tables.js";
import { EventStore } from "@/shared/application/event-store.js";
import { REDIS, type Redis } from "@/shared/infrastructure/redis/index.js";
import { createTestApp } from "./support/create-test-app.js";
import {
	createTestDatabase,
	type TestDatabase,
} from "./support/test-database.js";

/** The Redis leases and the Postgres scan for unfinished hands, against the real services. */
describe("Table lease adapters (e2e)", () => {
	let database: TestDatabase;
	let a: INestApplication<App>;
	let b: INestApplication<App>;

	beforeAll(async () => {
		database = await createTestDatabase();
		const boot = () =>
			createTestApp({
				config: {
					database: { url: database.url },
					table: { leaseTtlMs: 1_000 },
				},
			});
		a = await boot();
		b = await boot();
	});

	afterAll(async () => {
		await Promise.all([a, b].map((app) => app?.close()));
		await database?.drop();
	});

	it("gives a table to one instance at a time, with an epoch past any stored one", async () => {
		const tableId = randomUUID();
		const [mine, theirs] = [a, b].map((app) => app.get(TableLeases));

		const lease = await mine!.acquire(tableId, 41);
		expect(lease).toEqual({ tableId, epoch: 42 });
		expect(await theirs!.acquire(tableId, 0)).toBeNull();
		expect(await theirs!.ownerOf(tableId)).toBe(mine!.instanceId);
		expect(await theirs!.renew({ tableId, epoch: 42 })).toBe(false);
		expect(await mine!.renew(lease!)).toBe(true);

		// Released, it goes to the next instance with the next epoch, and is no orphan.
		await theirs!.release({ tableId, epoch: 42 });
		expect(await theirs!.ownerOf(tableId)).toBe(mine!.instanceId);
		await mine!.release(lease!);
		expect(await theirs!.acquire(tableId, 0)).toEqual({ tableId, epoch: 43 });
		expect(await mine!.orphans()).not.toContain(tableId);
	});

	it("names a table whose lease ran out without being released an orphan", async () => {
		const tableId = randomUUID();
		const leases = a.get(TableLeases);
		await leases.acquire(tableId, 0);

		await a.get<Redis>(REDIS).del(`${database.name}:table:${tableId}:owner`);

		expect(await leases.orphans()).toContain(tableId);
		expect(await leases.renew({ tableId, epoch: 1 })).toBe(false);
	});

	it("finds the tables whose last hand never ended", async () => {
		const store = a.get(EventStore, {
			strict: false,
		}) as EventStore<TableStreamEvent>;
		const scheduled = (handId: string) =>
			({
				type: "HandScheduled",
				v: 1,
				handId,
				buttonSeat: 0,
				smallBlindSeat: 0,
				bigBlindSeat: 1,
				seats: [0, 1],
			}) as const;
		const settled = (handId: string) =>
			({ type: "HandSettled", v: 1, handId, stacks: [] }) as const;
		await store.append("table-running", 0, [
			scheduled("h-1"),
			settled("h-1"),
			scheduled("h-2"),
		]);
		await store.append("table-between", 0, [scheduled("h-3"), settled("h-3")]);
		await store.append("hand-h-2", 0, [scheduled("not-a-table") as never]);

		expect(await a.get(UnfinishedTables).list()).toEqual(["running"]);
	});
});
