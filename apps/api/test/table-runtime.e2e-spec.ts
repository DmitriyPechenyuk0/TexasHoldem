import type { INestApplication } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import request from "supertest";
import type { App } from "supertest/types.js";
import {
	ExecuteTableCommand,
	type TableCommandInput,
} from "@/modules/table/application/commands/execute-table-command/execute-table-command.command.js";
import type { TableStreamEvent } from "@/modules/table/application/game-streams.js";
import { EventStore } from "@/shared/application/event-store.js";
import type { AppConfig } from "@/shared/infrastructure/config/index.js";
import { createTestApp } from "./support/create-test-app.js";
import { exampleConfig } from "./support/example-config.js";
import { tableConfig } from "./support/table.js";
import {
	createTestDatabase,
	type TestDatabase,
} from "./support/test-database.js";

describe("Table runtime (e2e)", () => {
	let database: TestDatabase;
	let app: INestApplication<App>;
	let store: EventStore<TableStreamEvent>;

	beforeAll(async () => {
		database = await createTestDatabase();
		app = await createTestApp({ config: { database: { url: database.url } } });
		store = app.get(EventStore, { strict: false });
	});

	afterAll(async () => {
		await app?.close();
		await database?.drop();
	});

	it("takes 100 commands sent to one table at once in order, without a version conflict", async () => {
		const bus = app.get(CommandBus);
		const send = (command: TableCommandInput) =>
			bus.execute(new ExecuteTableCommand("busy", command));
		await send({ type: "OpenTable", tableId: "busy", config: tableConfig() });

		// Each spectator joins, then leaves: only in order can every one of these be accepted.
		const commands = Array.from({ length: 50 }, (_, i) => `s${i}`).flatMap(
			(userId) => [
				{ type: "JoinAsSpectator" as const, userId },
				{ type: "LeaveSpectating" as const, userId },
			],
		);
		const outcomes = await Promise.allSettled(commands.map(send));

		expect(outcomes.filter((o) => o.status === "rejected")).toEqual([]);
		const stream = await store.readStream("table-busy");
		expect(stream.map((r) => r.version)).toEqual(
			Array.from({ length: 101 }, (_, i) => i + 1),
		);
		expect(stream.slice(1).map(({ event }) => event)).toEqual(
			commands.map(({ type, userId }) => ({
				type: type === "JoinAsSpectator" ? "SpectatorJoined" : "SpectatorLeft",
				v: 1,
				userId,
			})),
		);
	});

	describe("POST /api/dev/tables", () => {
		it("opens a 1/2 table for six, with any settings given", async () => {
			const response = await request(app.getHttpServer())
				.post("/api/dev/tables")
				.send({ bigBlind: 10, smallBlind: 5, maxSeats: 2 })
				.expect(201);

			const { tableId } = response.body as { tableId: string };
			expect(tableId).toMatch(/^[0-9a-f-]{36}$/);
			const [opened] = await store.readStream(`table-${tableId}`);
			expect(opened?.event).toEqual({
				type: "TableOpened",
				v: 1,
				tableId,
				config: {
					smallBlind: 5,
					bigBlind: 10,
					minBuyInBigBlinds: 50,
					maxBuyInBigBlinds: 200,
					maxSeats: 2,
					turnSeconds: 20,
					timeBankSeconds: 30,
					reconnectGraceSeconds: 120,
					disconnectedTurnSeconds: 5,
					sitOutSeconds: 600,
					sitOutHands: 3,
					visibility: "public",
				},
			});
		});

		it("refuses settings the table rules do not allow", async () => {
			const response = await request(app.getHttpServer())
				.post("/api/dev/tables")
				.send({ maxSeats: 12 })
				.expect(422);

			expect(response.body).toMatchObject({
				code: "table.invalid-config",
				params: { reason: "seats" },
			});
		});
	});
});

describe("Table runtime in production (e2e)", () => {
	let database: TestDatabase;
	let app: INestApplication<App>;

	beforeAll(async () => {
		database = await createTestDatabase();
		const production: Partial<AppConfig> = {
			nodeEnv: "production",
			database: { url: database.url },
			auth: {
				...exampleConfig().auth,
				secret: "a-real-secret-generated-for-production-0123",
			},
		};
		app = await createTestApp({ config: production });
	});

	afterAll(async () => {
		await app?.close();
		await database?.drop();
	});

	it("has no dev route to open tables", async () => {
		const response = await request(app.getHttpServer())
			.post("/api/dev/tables")
			.send({})
			.expect(404);

		expect(response.body).toMatchObject({ code: "http.not-found" });
	});
});
