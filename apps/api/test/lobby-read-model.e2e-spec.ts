import type { Ack } from "@holdem/shared";
import type { LobbyTable } from "@holdem/shared/contracts/lobby";
import type {
	LobbyClientToServerEvents,
	LobbyServerToClientEvents,
	TableClientToServerEvents,
	TableServerToClientEvents,
	TableView,
} from "@holdem/shared/realtime";
import type { INestApplication } from "@nestjs/common";
import type { Socket } from "socket.io-client";
import request from "supertest";
import type { App } from "supertest/types.js";
import { createTestApp } from "./support/create-test-app.js";
import { WEB_ORIGIN } from "./support/identity.js";
import { connectedSocket, signedInUser } from "./support/realtime.js";
import {
	createTestDatabase,
	type TestDatabase,
} from "./support/test-database.js";

type LobbySocket = Socket<LobbyServerToClientEvents, LobbyClientToServerEvents>;
type TableSocket = Socket<TableServerToClientEvents, TableClientToServerEvents>;

/** Two api instances: the lobby follows tables run on either (POK-97). */
describe("Lobby read model (e2e)", () => {
	let database: TestDatabase;
	const apps: INestApplication<App>[] = [];
	const urls: string[] = [];
	const sockets: Socket[] = [];

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
		for (const socket of sockets) socket.disconnect();
		await Promise.all(apps.map((app) => app.close()));
		await database?.drop();
	});

	let lastAddress = 0;
	const user = async () => {
		const { cookie, userId } = await signedInUser(apps[0]!);
		const ip = `198.19.0.${++lastAddress}`;
		const send = <T extends request.Test>(test: T) =>
			test
				.set("Cookie", cookie)
				.set("Origin", WEB_ORIGIN)
				.set("X-Forwarded-For", ip);
		return {
			cookie,
			userId,
			get: (path: string) => send(request(apps[0]!.getHttpServer()).get(path)),
			post: (path: string, body: object) =>
				send(request(apps[0]!.getHttpServer()).post(path)).send(body),
		};
	};
	const socketOn = async <S extends Socket>(
		instance: number,
		path: string,
		cookie: string,
	) => {
		const socket = await connectedSocket<S>(urls[instance]!, path, cookie);
		sockets.push(socket);
		return socket;
	};
	const createTable = async (
		creator: Awaited<ReturnType<typeof user>>,
		visibility: "public" | "private",
	) =>
		(
			(
				await creator
					.post("/api/lobby/tables", {
						name: `${visibility} game`,
						presetId: "micro",
						maxSeats: 2,
						visibility,
					})
					.expect(201)
			).body as { tableId: string }
		).tableId;
	const sit = async (instance: number, cookie: string, tableId: string) => {
		const socket = await socketOn<TableSocket>(instance, "/table", cookie);
		const id = tableId as TableView["tableId"];
		await socket.emitWithAck("join", { tableId: id, as: "player" });
		const taken = (await socket.emitWithAck("take-seat", {
			tableId: id,
			seat: 0,
			buyIn: 100,
		})) as Ack<object>;
		expect(taken.ok).toBe(true);
	};

	it("tells lobby watchers on any instance when a player sits down", async () => {
		const creator = await user();
		const watcher = await user();
		const lobby = await socketOn<LobbySocket>(1, "/lobby", watcher.cookie);
		const upserted: LobbyTable[] = [];
		lobby.on("table-upserted", (listing) => upserted.push(listing));
		await lobby.emitWithAck("watch", {});

		const tableId = await createTable(creator, "public");
		await sit(0, creator.cookie, tableId);

		// It reaches the other instance through the adapter's Redis stream: slow under a full run.
		await vi.waitFor(
			() => expect(upserted.at(-1)).toMatchObject({ tableId, playerCount: 1 }),
			{ timeout: 5_000 },
		);
		const watched = (await lobby.emitWithAck("watch", {})) as Ack<LobbyTable[]>;
		expect(watched.ok && watched.data).toContainEqual(
			expect.objectContaining({ tableId, playerCount: 1, smallBlind: 1 }),
		);
	});

	it("lists only public tables, filtered; my tables include private ones", async () => {
		const creator = await user();
		const publicId = await createTable(creator, "public");
		const privateId = await createTable(creator, "private");
		await sit(1, creator.cookie, publicId);

		await vi.waitFor(async () => {
			const listed = (
				await creator.get("/api/lobby/tables?hasFreeSeat=true").expect(200)
			).body as LobbyTable[];
			expect(listed).toContainEqual(
				expect.objectContaining({ tableId: publicId, playerCount: 1 }),
			);
			expect(listed.map((table) => table.tableId)).not.toContain(privateId);
		});
		const highStakes = (
			await creator.get("/api/lobby/tables?presetId=high").expect(200)
		).body as LobbyTable[];
		expect(highStakes.map((table) => table.tableId)).not.toContain(publicId);

		const mine = (await creator.get("/api/lobby/my-tables").expect(200))
			.body as {
			tableId: string;
			visibility: string;
			mine: boolean;
			inviteCode: string | null;
		}[];
		expect(mine).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					tableId: publicId,
					mine: true,
					inviteCode: null,
				}),
				expect.objectContaining({
					tableId: privateId,
					visibility: "private",
					inviteCode: expect.any(String),
				}),
			]),
		);

		// Another player sees a table in theirs once they sit at it, without its invite code.
		const guest = await user();
		const guestTable = await createTable(creator, "public");
		await sit(0, guest.cookie, guestTable);
		await vi.waitFor(async () => {
			const theirs = (await guest.get("/api/lobby/my-tables").expect(200))
				.body as {
				tableId: string;
				mine: boolean;
			}[];
			expect(theirs).toEqual([
				expect.objectContaining({ tableId: guestTable, mine: false }),
			]);
		});
	});

	it("lets the creator close an empty table: it leaves the lobby, and refuses to be joined", async () => {
		const creator = await user();
		const watcher = await user();
		const lobby = await socketOn<LobbySocket>(1, "/lobby", watcher.cookie);
		const removed: string[] = [];
		lobby.on("table-removed", ({ tableId }) => removed.push(tableId));
		await lobby.emitWithAck("watch", {});
		const tableId = await createTable(creator, "public");
		const occupied = await createTable(creator, "public");
		await sit(0, creator.cookie, occupied);
		// The creator's third open table: the most they may have.
		await createTable(creator, "private");

		const stranger = await user();
		await stranger.post(`/api/lobby/tables/${tableId}/close`, {}).expect(403);
		await vi.waitFor(async () => {
			const notEmpty = await creator
				.post(`/api/lobby/tables/${occupied}/close`, {})
				.expect(409);
			expect(notEmpty.body).toMatchObject({ code: "lobby.table-not-empty" });
		});
		await creator.post(`/api/lobby/tables/${tableId}/close`, {}).expect(204);

		await vi.waitFor(() => expect(removed).toContain(tableId));
		const listed = (await creator.get("/api/lobby/tables").expect(200))
			.body as LobbyTable[];
		expect(listed.map((table) => table.tableId)).not.toContain(tableId);
		const socket = await socketOn<TableSocket>(0, "/table", stranger.cookie);
		const joined = (await socket.emitWithAck("join", {
			tableId: tableId as TableView["tableId"],
			as: "player",
		})) as Ack<TableView>;
		expect(joined).toMatchObject({
			ok: false,
			error: { code: "table.closed" },
		});
		// A closed table no longer counts against its creator's limit.
		await createTable(creator, "public");
	});
});
