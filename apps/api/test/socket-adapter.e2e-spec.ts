import type { Ack } from "@holdem/shared";
import type {
	TableClientToServerEvents,
	TableEventsBatch,
	TableServerToClientEvents,
	TableView,
} from "@holdem/shared/realtime";
import type { INestApplication } from "@nestjs/common";
import type { Socket } from "socket.io-client";
import request from "supertest";
import type { App } from "supertest/types.js";
import { createTestApp } from "./support/create-test-app.js";
import { connectedSocket, signedInUser } from "./support/realtime.js";
import {
	createTestDatabase,
	type TestDatabase,
} from "./support/test-database.js";

type TableSocket = Socket<TableServerToClientEvents, TableClientToServerEvents>;

const ok = <T>(ack: Ack<T>): T => {
	if (!ack.ok) throw new Error(`refused: ${ack.error.code}`);
	return ack.data;
};

/** Two api instances behind one Redis: rooms reach sockets on both (POK-78). */
describe("socket.io across instances (e2e)", () => {
	let database: TestDatabase;
	const apps: INestApplication<App>[] = [];
	const urls: string[] = [];
	const sockets: TableSocket[] = [];

	beforeAll(async () => {
		database = await createTestDatabase();
		for (let instance = 0; instance < 2; instance++) {
			const app = await createTestApp({
				config: { database: { url: database.url }, trustProxy: "loopback" },
			});
			await app.listen(0, "127.0.0.1");
			apps.push(app);
			urls.push(await app.getUrl());
		}
	});

	afterAll(async () => {
		for (const socket of sockets) {
			socket.disconnect();
		}
		await Promise.all(apps.map((app) => app.close()));
		await database?.drop();
	});

	/** A signed-in user's socket on `instance`, following the table, with the batches it gets. */
	async function follower(tableId: string, instance: number, cookie?: string) {
		const session = cookie ?? (await signedInUser(apps[0]!)).cookie;
		const socket = await connectedSocket<TableSocket>(
			urls[instance]!,
			"/table",
			session,
		);
		sockets.push(socket);
		const batches: TableEventsBatch[] = [];
		socket.on("events", (batch) => batches.push(batch));
		ok(
			await socket.emitWithAck("join", {
				tableId: tableId as TableView["tableId"],
				as: "player",
			}),
		);
		return { socket, batches, cookie: session };
	}

	const tableEvents = (batches: TableEventsBatch[]) =>
		batches.flatMap(({ table }) => table.map(({ type }) => type));

	it("reaches a table's room and a user's room on the other instance", async () => {
		const response = await request(apps[0]!.getHttpServer())
			.post("/api/dev/tables")
			.send({})
			.expect(201);
		const { tableId } = response.body as { tableId: string };
		// A spectator follows the table on instance 1; the player sits down on instance 0, with a
		// second tab on instance 1.
		const carol = await follower(tableId, 1);
		const bob = await follower(tableId, 0);
		const bobsOtherTab = await follower(tableId, 1, bob.cookie);

		ok(
			await bob.socket.emitWithAck("take-seat", {
				tableId: tableId as TableView["tableId"],
				seat: 0,
				buyIn: 200,
			}),
		);

		await vi.waitFor(() => {
			expect(tableEvents(carol.batches)).toContain("SeatTaken");
			expect(tableEvents(bobsOtherTab.batches)).toContain("SeatTaken");
		});
		// Each socket gets one batch per change: its user's, or the spectators'.
		const seatTaken = (batches: TableEventsBatch[]) =>
			batches.filter(({ table }) => table.some((e) => e.type === "SeatTaken"));
		expect(seatTaken(carol.batches)).toHaveLength(1);
		expect(seatTaken(bobsOtherTab.batches)).toHaveLength(1);
	});
});
