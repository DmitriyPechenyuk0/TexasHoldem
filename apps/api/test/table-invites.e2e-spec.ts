import type { Ack } from "@holdem/shared";
import {
	AcceptTableInviteResponse,
	TableInvitesResponse,
} from "@holdem/shared/contracts/social";
import type {
	SocialClientToServerEvents,
	SocialServerToClientEvents,
	TableClientToServerEvents,
	TableServerToClientEvents,
	TableView,
} from "@holdem/shared/realtime";
import type { INestApplication } from "@nestjs/common";
import type { Socket } from "socket.io-client";
import request from "supertest";
import type { App } from "supertest/types.js";
import { createTestApp } from "./support/create-test-app.js";
import { problemOf, WEB_ORIGIN } from "./support/identity.js";
import { connectedSocket, signedInUser } from "./support/realtime.js";
import {
	createTestDatabase,
	type TestDatabase,
} from "./support/test-database.js";

type SocialSocket = Socket<
	SocialServerToClientEvents,
	SocialClientToServerEvents
>;
type TableSocket = Socket<TableServerToClientEvents, TableClientToServerEvents>;

/** Inviting a friend to a table (POK-109). */
describe("Table invites (e2e)", () => {
	let database: TestDatabase;
	let app: INestApplication<App>;
	let baseUrl: string;
	const sockets: Socket[] = [];

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
	const user = async () => {
		const { cookie, userId } = await signedInUser(app);
		const ip = `198.21.0.${++lastAddress}`;
		const send = <T extends request.Test>(test: T) =>
			test
				.set("Cookie", cookie)
				.set("Origin", WEB_ORIGIN)
				.set("X-Forwarded-For", ip);
		const get = (path: string) => send(request(app.getHttpServer()).get(path));
		const post = (path: string, body: object = {}) =>
			send(request(app.getHttpServer()).post(path)).send(body);
		const { username } = (await get("/api/profile").expect(200)).body as {
			username: string;
		};
		return { cookie, userId, username, get, post };
	};
	type User = Awaited<ReturnType<typeof user>>;

	const befriend = async (a: User, b: User) => {
		await a.post("/api/friend-requests", { username: b.username }).expect(200);
		await b.post(`/api/friend-requests/${a.userId}/accept`).expect(204);
	};

	const privateTable = async (creator: User) =>
		(
			(
				await creator
					.post("/api/lobby/tables", {
						name: "Friday game",
						presetId: "micro",
						maxSeats: 6,
						visibility: "private",
						password: "letmein",
					})
					.expect(201)
			).body as { tableId: string }
		).tableId;

	/** Joins the table on `/table` and takes a seat; answers the take-seat ack. */
	const sit = async ({ cookie }: User, tableId: string, seat: number) => {
		const socket = await connectedSocket<TableSocket>(
			baseUrl,
			"/table",
			cookie,
		);
		sockets.push(socket);
		const id = tableId as TableView["tableId"];
		const joined = (await socket.emitWithAck("join", {
			tableId: id,
			as: "player",
		})) as Ack<TableView>;
		if (!joined.ok) return joined;
		return (await socket.emitWithAck("take-seat", {
			tableId: id,
			seat,
			buyIn: 100,
		})) as Ack<object>;
	};

	it("brings a friend to a private table without its password", async () => {
		const [alice, bob] = [await user(), await user()];
		await befriend(alice, bob);
		const tableId = await privateTable(alice);
		const social = await connectedSocket<SocialSocket>(
			baseUrl,
			"/social",
			bob.cookie,
		);
		sockets.push(social);
		const told: unknown[] = [];
		social.on("table-invite-received", (invite) => told.push(invite));
		expect(await sit(bob, tableId, 1)).toMatchObject({
			ok: false,
			error: { code: "table.access-denied" },
		});

		await alice
			.post("/api/table-invites", { friendId: bob.userId, tableId })
			.expect(204);

		await vi.waitFor(() =>
			expect(told).toEqual([
				{
					from: expect.objectContaining({ userId: alice.userId }),
					table: expect.objectContaining({
						tableId,
						name: "Friday game",
						visibility: "private",
						smallBlind: 1,
					}),
					expiresAt: expect.any(String),
				},
			]),
		);
		const waiting = TableInvitesResponse.parse(
			(await bob.get("/api/table-invites").expect(200)).body,
		);
		expect(waiting).toEqual([
			expect.objectContaining({
				from: expect.objectContaining({ userId: alice.userId }),
			}),
		]);
		expect(Date.parse(waiting[0]!.expiresAt) - Date.now()).toBeGreaterThan(
			9 * 60_000,
		);

		const accepted = AcceptTableInviteResponse.parse(
			(
				await bob
					.post("/api/table-invites/accept", {
						inviterId: alice.userId,
						tableId,
					})
					.expect(200)
			).body,
		);
		expect(accepted).toEqual({ tableId });
		expect(await sit(bob, tableId, 1)).toMatchObject({ ok: true });
		expect((await bob.get("/api/table-invites").expect(200)).body).toEqual([]);
	});

	it("rejects invites from strangers, and to tables out of the inviter's reach", async () => {
		const [carol, dave, erin] = [await user(), await user(), await user()];
		await befriend(carol, dave);
		const erinsTable = await privateTable(erin);

		const stranger = await erin
			.post("/api/table-invites", {
				friendId: dave.userId,
				tableId: erinsTable,
			})
			.expect(404);
		expect(problemOf(stranger).code).toBe("social.not-friends");
		const outOfReach = await carol
			.post("/api/table-invites", {
				friendId: dave.userId,
				tableId: erinsTable,
			})
			.expect(404);
		expect(problemOf(outOfReach).code).toBe("social.table-not-found");
	});

	it("sends one invite a minute per friend and table, and declines quietly", async () => {
		const [frank, grace] = [await user(), await user()];
		await befriend(frank, grace);
		const tableId = await privateTable(frank);
		const invite = { friendId: grace.userId, tableId };

		await frank.post("/api/table-invites", invite).expect(204);
		const again = await frank.post("/api/table-invites", invite).expect(429);
		expect(again.headers["retry-after"]).toBeDefined();

		const answer = { inviterId: frank.userId, tableId };
		await grace.post("/api/table-invites/decline", answer).expect(204);
		const gone = await grace
			.post("/api/table-invites/accept", answer)
			.expect(404);
		expect(problemOf(gone).code).toBe("social.invite-not-found");
		expect(await sit(grace, tableId, 2)).toMatchObject({
			ok: false,
			error: { code: "table.access-denied" },
		});
	});
});
