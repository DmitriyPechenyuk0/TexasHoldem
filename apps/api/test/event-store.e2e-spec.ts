import { sql } from "drizzle-orm";
import pg from "pg";
import {
	loadDecider,
	saveDecider,
} from "@/shared/application/event-sourcing.js";
import {
	ConcurrencyError,
	EventStore,
} from "@/shared/application/event-store.js";
import { PostgresEventStore } from "@/shared/infrastructure/event-store/index.js";
import { tableDecider } from "@/modules/table/domain/table-decider.js";
import type { TableEvent } from "@/modules/table/domain/table-events.js";
import { tableEvents } from "@/modules/table/infrastructure/persistence/schema.js";
import {
	type ContractEvent,
	eventStoreContract,
} from "./support/event-store-contract.js";
import {
	createTestDatabase,
	type TestDatabase,
} from "./support/test-database.js";

describe("PostgresEventStore (e2e)", () => {
	let database: TestDatabase;

	beforeAll(async () => {
		database = await createTestDatabase();
	});

	afterAll(async () => {
		await database?.drop();
	});

	const truncate = async () => {
		await database.db.execute(sql`truncate ${tableEvents} restart identity`);
	};

	describe("contract", () => {
		eventStoreContract(() => ({
			create: (upcasters) =>
				new PostgresEventStore<ContractEvent>(
					database.db,
					tableEvents,
					upcasters,
				),
			reset: truncate,
		}));
	});

	describe("storage", () => {
		let store: EventStore<ContractEvent>;

		beforeEach(async () => {
			await truncate();
			store = new PostgresEventStore(database.db, tableEvents);
		});

		it("keeps type and version in their own columns, not in the payload", async () => {
			await store.append(
				"account-1",
				0,
				[{ type: "Deposited", v: 1, amount: 5 }],
				{
					causationId: "cmd-1",
				},
			);

			const rows = await database.db.select().from(tableEvents);
			expect(rows).toMatchObject([
				{
					globalPosition: 1,
					streamId: "account-1",
					version: 1,
					type: "Deposited",
					schemaVersion: 1,
					payload: { amount: 5 },
					metadata: { causationId: "cmd-1" },
				},
			]);
		});

		it("turns away an append that raced another to the same version", async () => {
			// Another append holds version 1 uncommitted: ours sees the stream at 0, inserts, and
			// waits on the unique (stream, version) key until that one commits.
			const other = new pg.Client({ connectionString: database.url });
			await other.connect();
			try {
				await other.query("begin");
				await other.query(
					`insert into table_events (stream_id, version, type, schema_version, payload, metadata)
					values ('account-1', 1, 'Deposited', 1, '{"amount": 1}', '{}')`,
				);
				const append = store.append("account-1", 0, [
					{ type: "Deposited", v: 1, amount: 2 },
				]);
				await vi.waitFor(async () => {
					const [row] = await database.db.execute<{ waiting: number }>(
						sql`select count(*)::int as waiting from pg_stat_activity
							where datname = current_database() and wait_event_type = 'Lock'`,
						"objects",
					);
					expect(row?.waiting).toBe(1);
				});
				await other.query("commit");

				await expect(append).rejects.toBeInstanceOf(ConcurrencyError);
				await expect(append).rejects.toMatchObject({
					cause: { cause: { code: "23505" } },
				});
			} finally {
				await other.end();
			}
			expect((await store.readStream("account-1")).map((r) => r.event)).toEqual(
				[{ type: "Deposited", v: 1, amount: 1 }],
			);
		});

		it("passes on a database failure that is not a conflict", async () => {
			const broken = {
				type: "Deposited",
				v: 1.5,
				amount: 1,
			} as unknown as ContractEvent;

			const append = store.append("account-1", 0, [broken]);

			await expect(append).rejects.toThrow();
			await expect(append).rejects.not.toBeInstanceOf(ConcurrencyError);
		});

		// One append: the store's own cost. Appends one by one are bound by the disk's fsync per
		// commit (about 1.2 ms locally, so ~550 commands a second per stream), not by the store.
		it("appends 1,000 events to one stream and reads them back well within a second", async () => {
			const events = Array.from(
				{ length: 1_000 },
				(_, amount): ContractEvent => ({ type: "Deposited", v: 1, amount }),
			);

			const started = performance.now();
			await store.append("account-1", 0, events);
			const recorded = await store.readStream("account-1");
			const elapsed = performance.now() - started;

			expect(recorded.map((r) => r.event)).toEqual(events);
			expect(recorded.at(-1)?.version).toBe(1_000);
			expect(elapsed).toBeLessThan(1_000);
		});
	});

	it("stores a table's stream and folds it back into the same state", async () => {
		await truncate();
		const store = new PostgresEventStore<TableEvent>(database.db, tableEvents);
		const streamId = "table-1";
		const commands = [
			{
				type: "OpenTable",
				tableId: "table-1",
				config: {
					smallBlind: 1,
					bigBlind: 2,
					minBuyInBigBlinds: 40,
					maxBuyInBigBlinds: 100,
					maxSeats: 6,
					turnSeconds: 20,
					timeBankSeconds: 30,
					visibility: "public",
				},
			},
			{
				type: "TakeSeat",
				userId: "user-1",
				seat: 0,
				buyIn: 200,
				verified: true,
			},
			{ type: "JoinAsSpectator", userId: "user-2" },
		] as const;

		let loaded = await loadDecider(store, tableDecider, streamId);
		for (const command of commands) {
			const decision = tableDecider.decide(command, loaded.state);
			if (!decision.ok) throw decision.error;
			loaded = await saveDecider(
				store,
				tableDecider,
				streamId,
				loaded,
				decision.value,
				{
					userId: "user-1",
				},
			);
		}

		expect(loaded.version).toBe(3);
		expect(await loadDecider(store, tableDecider, streamId)).toEqual(loaded);
	});
});
