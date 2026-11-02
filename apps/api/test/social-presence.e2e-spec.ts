import type { Ack } from "@holdem/shared";
import type {
	FriendPresence,
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
import { WEB_ORIGIN } from "./support/identity.js";
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
type Presence = FriendPresence["presence"];

/** Two api instances: friends see each other's presence wherever each is connected (POK-105). */
describe("Presence (e2e)", () => {
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
		const ip = `198.20.0.${++lastAddress}`;
		const send = <T extends request.Test>(test: T) =>
			test
				.set("Cookie", cookie)
				.set("Origin", WEB_ORIGIN)
				.set("X-Forwarded-For", ip);
		const get = (path: string) =>
			send(request(apps[0]!.getHttpServer()).get(path));
		const post = (path: string, body: object = {}) =>
			send(request(apps[0]!.getHttpServer()).post(path)).send(body);
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

	/** A `/social` socket that records every presence it is told, by player. */
	const socialOn = async (instance: number, { cookie }: User) => {
		const socket = await connectedSocket<SocialSocket>(
			urls[instance]!,
			"/social",
			cookie,
		);
		sockets.push(socket);
		const told: FriendPresence[] = [];
		socket.on("presence-changed", (change) => told.push(change));
		const lastOf = (userId: string): Presence | undefined =>
			told.filter((change) => change.userId === userId).at(-1)?.presence;
		const snapshot = async () => {
			const answer = (await socket.emitWithAck("friends-presence", {})) as Ack<
				FriendPresence[]
			>;
			if (!answer.ok) throw new Error(answer.error.code);
			return answer.data;
		};
		return { socket, told, lastOf, snapshot };
	};

	it("shows a friend online within moments, on another instance, then offline", async () => {
		const [alice, bob] = [await user(), await user()];
		await befriend(alice, bob);
		const aliceSees = await socialOn(0, alice);
		expect(await aliceSees.snapshot()).toEqual([
			{ userId: bob.userId, presence: { status: "offline" } },
		]);

		const bobs = await socialOn(1, bob);

		await vi.waitFor(
			() => expect(aliceSees.lastOf(bob.userId)).toEqual({ status: "online" }),
			{ timeout: 2_000 },
		);
		expect(await bobs.snapshot()).toEqual([
			{ userId: alice.userId, presence: { status: "online" } },
		]);

		bobs.socket.disconnect();
		await vi.waitFor(
			() => expect(aliceSees.lastOf(bob.userId)).toEqual({ status: "offline" }),
			{ timeout: 8_000 },
		);
	}, 20_000);

	it("keeps a friend online through a reload, and through a second tab closing", async () => {
		const [carol, dave] = [await user(), await user()];
		await befriend(carol, dave);
		const carolSees = await socialOn(0, carol);
		const firstTab = await socialOn(0, dave);
		const secondTab = await socialOn(1, dave);
		await vi.waitFor(() =>
			expect(carolSees.lastOf(dave.userId)).toEqual({ status: "online" }),
		);

		secondTab.socket.disconnect();
		firstTab.socket.disconnect();
		await socialOn(1, dave);
		await new Promise((resolve) => setTimeout(resolve, 7_000));

		expect(carolSees.told.map(({ presence }) => presence.status)).toEqual([
			"online",
		]);
		expect(await carolSees.snapshot()).toEqual([
			{ userId: dave.userId, presence: { status: "online" } },
		]);
	}, 20_000);

	it("names a friend's table only to friends who may join it", async () => {
		const [erin, frank, grace] = [await user(), await user(), await user()];
		await befriend(erin, frank);
		await befriend(erin, grace);
		const franks = await socialOn(0, frank);
		const graces = await socialOn(1, grace);
		await socialOn(1, erin);
		const tableId = (
			(
				await erin
					.post("/api/lobby/tables", {
						name: "Private game",
						presetId: "micro",
						maxSeats: 2,
						visibility: "private",
					})
					.expect(201)
			).body as { tableId: string; inviteCode: string }
		).tableId;
		const { inviteCode } = (await erin.get("/api/lobby/my-tables").expect(200))
			.body[0] as { inviteCode: string };
		await frank.post(`/api/lobby/invites/${inviteCode}/redeem`).expect(200);

		const table = await connectedSocket<TableSocket>(
			urls[0]!,
			"/table",
			erin.cookie,
		);
		sockets.push(table);
		const id = tableId as TableView["tableId"];
		await table.emitWithAck("join", { tableId: id, as: "player" });
		const taken = (await table.emitWithAck("take-seat", {
			tableId: id,
			seat: 0,
			buyIn: 100,
		})) as Ack<object>;
		expect(taken.ok).toBe(true);

		await vi.waitFor(() => {
			expect(franks.lastOf(erin.userId)).toEqual({
				status: "at-table",
				tableId,
			});
			expect(graces.lastOf(erin.userId)).toEqual({ status: "playing" });
		});

		await table.emitWithAck("leave-seat", { tableId: id });
		await vi.waitFor(() =>
			expect(franks.lastOf(erin.userId)).toEqual({ status: "online" }),
		);
	}, 20_000);

	it("tells a player of a friend request, and both of their new friendship", async () => {
		const [heidi, ivan] = [await user(), await user()];
		const heidis = await socialOn(0, heidi);
		const ivans = await socialOn(1, ivan);
		const requests: unknown[] = [];
		const added: unknown[] = [];
		ivans.socket.on("friend-request-received", (event) => requests.push(event));
		heidis.socket.on("friend-added", (event) => added.push(event));

		await heidi.post("/api/friend-requests", { username: ivan.username });
		await vi.waitFor(() =>
			expect(requests).toEqual([
				{ from: expect.objectContaining({ userId: heidi.userId }) },
			]),
		);
		await ivan.post(`/api/friend-requests/${heidi.userId}/accept`).expect(204);

		await vi.waitFor(() => {
			expect(added).toEqual([
				{ friend: expect.objectContaining({ userId: ivan.userId }) },
			]);
			expect(heidis.lastOf(ivan.userId)).toEqual({ status: "online" });
			expect(ivans.lastOf(heidi.userId)).toEqual({ status: "online" });
		});
	});
});
