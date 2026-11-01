import type { Ack } from "@holdem/shared";
import type {
	TableClientToServerEvents,
	TableServerToClientEvents,
	TableView,
} from "@holdem/shared/realtime";
import type { INestApplication } from "@nestjs/common";
import type { Socket } from "socket.io-client";
import request from "supertest";
import type { App } from "supertest/types.js";
import { createTestApp } from "./support/create-test-app.js";
import {
	browser,
	type Browser,
	problemOf,
	signUpAndVerify,
	WEB_ORIGIN,
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

	let lastAddress = 0;
	/** REST calls with a session cookie, from an address of their own. */
	const asUser = (cookie: string) => {
		const ip = `198.18.0.${++lastAddress}`;
		const send = <T extends request.Test>(test: T) =>
			test
				.set("Cookie", cookie)
				.set("Origin", WEB_ORIGIN)
				.set("X-Forwarded-For", ip);
		return {
			get: (path: string) => send(request(app.getHttpServer()).get(path)),
			post: (path: string, body?: object) =>
				send(request(app.getHttpServer()).post(path)).send(body ?? {}),
		};
	};

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

	describe("private tables", () => {
		/** A verified player with a socket on the table namespace. */
		const playerWithSocket = async () => {
			const { cookie } = await signedInUser(app);
			const client = asUser(cookie);
			const socket = await connectedSocket<TableSocket>(
				baseUrl,
				"/table",
				cookie,
			);
			sockets.push(socket);
			return { client, socket };
		};
		const join = async (socket: TableSocket, tableId: string) =>
			(await socket.emitWithAck("join", {
				tableId: tableId as TableView["tableId"],
				as: "player",
			})) as Ack<TableView>;
		const takeSeat = async (socket: TableSocket, tableId: string) =>
			(await socket.emitWithAck("take-seat", {
				tableId: tableId as TableView["tableId"],
				seat: 0,
				buyIn: 400,
			})) as Ack<object>;

		it("let in their creator and whoever redeemed the invite with the password", async () => {
			const creator = await playerWithSocket();
			const created = await creator.client
				.post("/api/lobby/tables", {
					...table,
					visibility: "private",
					password: "secret",
				})
				.expect(201);
			const { tableId, inviteCode } = created.body as {
				tableId: string;
				inviteCode: string;
			};
			expect(inviteCode).toMatch(/^[2-9A-HJKMNP-Z]{8}$/);
			expect((await join(creator.socket, tableId)).ok).toBe(true);

			const guest = await playerWithSocket();
			const denied = await join(guest.socket, tableId);
			expect(denied).toMatchObject({
				ok: false,
				error: { code: "table.access-denied" },
			});
			expect(await takeSeat(guest.socket, tableId)).toMatchObject({
				ok: false,
				error: { code: "table.access-denied" },
			});

			const invite = await guest.client
				.get(`/api/lobby/invites/${inviteCode.toLowerCase()}`)
				.expect(200);
			expect(invite.body).toEqual({
				tableId,
				name: "Friday game",
				smallBlind: 5,
				bigBlind: 10,
				maxSeats: 6,
				passwordRequired: true,
			});
			const wrong = await guest.client
				.post(`/api/lobby/invites/${inviteCode}/redeem`, { password: "guess" })
				.expect(403);
			expect(problemOf(wrong).code).toBe("lobby.wrong-password");
			await guest.client
				.post(`/api/lobby/invites/${inviteCode}/redeem`, { password: "secret" })
				.expect(200, { tableId });

			expect((await join(guest.socket, tableId)).ok).toBe(true);
			expect(await takeSeat(guest.socket, tableId)).toEqual({
				ok: true,
				data: {},
			});
		});

		it("limit password tries per player and table", async () => {
			const creator = await player();
			const { inviteCode } = (
				await creator
					.post("/api/lobby/tables", {
						...table,
						visibility: "private",
						password: "secret",
					})
					.expect(201)
			).body as { inviteCode: string };
			const guesser = await player();

			for (let attempt = 0; attempt < 5; attempt++) {
				await guesser
					.post(`/api/lobby/invites/${inviteCode}/redeem`, {
						password: "guess",
					})
					.expect(403);
			}
			const refused = await guesser
				.post(`/api/lobby/invites/${inviteCode}/redeem`, { password: "secret" })
				.expect(429);
			expect(problemOf(refused).code).toBe("request.rate-limited");
			expect(Number(refused.headers["retry-after"])).toBeGreaterThan(0);
		}, 20_000);

		it("get a new code from their creator: the old link stops, access granted stays", async () => {
			const creator = await player();
			const { tableId, inviteCode } = (
				await creator
					.post("/api/lobby/tables", { ...table, visibility: "private" })
					.expect(201)
			).body as { tableId: string; inviteCode: string };
			const guest = await playerWithSocket();
			await guest.client
				.post(`/api/lobby/invites/${inviteCode}/redeem`, {})
				.expect(200);

			const stranger = await player();
			const notTheirs = await stranger
				.post(`/api/lobby/tables/${tableId}/invite`)
				.expect(403);
			expect(problemOf(notTheirs).code).toBe("lobby.not-creator");
			const renewed = await creator
				.post(`/api/lobby/tables/${tableId}/invite`)
				.expect(201);
			const { inviteCode: newCode } = renewed.body as { inviteCode: string };

			expect(newCode).not.toBe(inviteCode);
			const gone = await stranger
				.get(`/api/lobby/invites/${inviteCode}`)
				.expect(404);
			expect(problemOf(gone).code).toBe("lobby.invite-not-found");
			await stranger.get(`/api/lobby/invites/${newCode}`).expect(200);
			expect((await join(guest.socket, tableId)).ok).toBe(true);
		});

		it("answer a malformed invite code as invalid", async () => {
			const someone = await player();
			await someone.get("/api/lobby/invites/0OIL1234").expect(400);
		});
	});
});
