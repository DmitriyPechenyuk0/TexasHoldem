import type { Ack } from "@holdem/shared";
import type {
	TableClientToServerEvents,
	TableServerToClientEvents,
	TableView,
} from "@holdem/shared/realtime";
import type { INestApplication } from "@nestjs/common";
import type { Socket } from "socket.io-client";
import type { App } from "supertest/types.js";
import { createTestApp } from "./support/create-test-app.js";
import {
	browser,
	type Browser,
	problemOf,
	signUpAndVerify,
} from "./support/identity.js";
import { connectedSocket, signedInUser } from "./support/realtime.js";
import {
	createTestDatabase,
	type TestDatabase,
} from "./support/test-database.js";

type TableSocket = Socket<TableServerToClientEvents, TableClientToServerEvents>;

const table = {
	name: "Friday game",
	presetId: "low",
	maxSeats: 6,
	visibility: "public",
};

describe("Lobby (e2e)", () => {
	let database: TestDatabase;
	let app: INestApplication<App>;
	let baseUrl: string;
	const sockets: TableSocket[] = [];

	beforeAll(async () => {
		database = await createTestDatabase();
		app = await createTestApp({
			config: { database: { url: database.url }, trustProxy: "loopback" },
		});
		await app.listen(0, "127.0.0.1");
		baseUrl = await app.getUrl();
	});

	afterAll(async () => {
		for (const socket of sockets) socket.disconnect();
		await app?.close();
		await database?.drop();
	});

	const player = async (): Promise<Browser> => {
		const client = browser(app);
		await signUpAndVerify(client);
		return client;
	};

	it("offers the stakes a table can have", async () => {
		const response = await browser(app).get("/api/lobby/presets").expect(200);

		expect(response.body).toEqual([
			expect.objectContaining({ id: "micro", smallBlind: 1, bigBlind: 2 }),
			expect.objectContaining({ id: "low", smallBlind: 5, bigBlind: 10 }),
			expect.objectContaining({ id: "mid", smallBlind: 25, bigBlind: 50 }),
			expect.objectContaining({ id: "high", smallBlind: 100, bigBlind: 200 }),
		]);
	});

	it("creates a table a player can join at once on the table namespace", async () => {
		const creator = await player();

		const created = await creator
			.post("/api/lobby/tables", { ...table, turnSeconds: 30 })
			.expect(201);
		const { tableId } = created.body as { tableId: string };

		const { cookie } = await signedInUser(app);
		const socket = await connectedSocket<TableSocket>(
			baseUrl,
			"/table",
			cookie,
		);
		sockets.push(socket);
		const joined = (await socket.emitWithAck("join", {
			tableId: tableId as TableView["tableId"],
			as: "player",
		})) as Ack<TableView>;
		expect(joined).toMatchObject({
			ok: true,
			data: {
				tableId,
				status: "open",
				settings: {
					smallBlind: 5,
					bigBlind: 10,
					maxSeats: 6,
					turnSeconds: 30,
					visibility: "public",
				},
			},
		});
	});

	it("answers broken settings with stable codes", async () => {
		const creator = await player();

		const name = await creator
			.post("/api/lobby/tables", { ...table, name: "   " })
			.expect(422);
		expect(problemOf(name)).toMatchObject({
			code: "lobby.invalid-name",
			params: { min: 1, max: 40 },
		});
		const preset = await creator
			.post("/api/lobby/tables", { ...table, presetId: "nosebleed" })
			.expect(422);
		expect(problemOf(preset).code).toBe("lobby.unknown-preset");
		const seats = await creator
			.post("/api/lobby/tables", { ...table, maxSeats: 12 })
			.expect(400);
		expect(problemOf(seats).code).toBe("request.invalid");
	});

	it("lets a player keep three tables open at most", async () => {
		const creator = await player();
		await Promise.all(
			[1, 2, 3].map(() => creator.post("/api/lobby/tables", table).expect(201)),
		);

		const fourth = await creator.post("/api/lobby/tables", table).expect(409);
		expect(problemOf(fourth)).toMatchObject({
			code: "lobby.too-many-tables",
			params: { max: 3 },
		});
	});

	it("lets only signed-in players create tables", async () => {
		await browser(app).post("/api/lobby/tables", table).expect(401);
	});
});
