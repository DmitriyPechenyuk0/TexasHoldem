import {
	FriendRequestsResponse,
	FriendsResponse,
	PlayerSearchResponse,
	SendFriendRequestResponse,
} from "@holdem/shared/contracts/social";
import type { INestApplication } from "@nestjs/common";
import type { App } from "supertest/types.js";
import { createTestApp } from "./support/create-test-app.js";
import {
	type Browser,
	browser,
	problemOf,
	signUpAndVerify,
} from "./support/identity.js";
import {
	createTestDatabase,
	type TestDatabase,
} from "./support/test-database.js";

interface Player {
	readonly client: Browser;
	readonly userId: string;
	/** As stored: lowercase. */
	readonly username: string;
}

describe("Social (e2e)", () => {
	let database: TestDatabase;
	let app: INestApplication<App>;

	beforeAll(async () => {
		database = await createTestDatabase();
		app = await createTestApp({
			config: { database: { url: database.url }, trustProxy: "loopback" },
		});
	});

	afterAll(async () => {
		await app?.close();
		await database?.drop();
	});

	/** A verified, signed-in player whose profile exists. */
	async function player(): Promise<Player> {
		const client = browser(app);
		await signUpAndVerify(client);
		const profile = await vi.waitFor(async () => {
			const response = await client.get("/api/profile");
			expect(response.status).toBe(200);
			return response.body as { userId: string; username: string };
		});
		return { client, userId: profile.userId, username: profile.username };
	}

	const ask = async (from: Player, to: Player) =>
		SendFriendRequestResponse.parse(
			(
				await from.client
					.post("/api/friend-requests", { username: to.username.toUpperCase() })
					.expect(200)
			).body,
		);
	const friendsOf = async ({ client }: Player) =>
		FriendsResponse.parse((await client.get("/api/friends").expect(200)).body);
	const requestsOf = async (
		{ client }: Player,
		direction: "incoming" | "outgoing",
	) =>
		FriendRequestsResponse.parse(
			(await client.get(`/api/friend-requests/${direction}`).expect(200)).body,
		);
	const search = async ({ client }: Player, q: string) =>
		PlayerSearchResponse.parse(
			(await client.get(`/api/players/search?q=${q}`).expect(200)).body,
		);

	it("takes two players from a request to friends, and apart again", async () => {
		const [alice, bob] = [await player(), await player()];

		expect(await search(alice, bob.username)).toEqual([
			expect.objectContaining({ userId: bob.userId, relation: "none" }),
		]);
		expect(await ask(alice, bob)).toEqual({
			userId: bob.userId,
			status: "requested",
		});

		expect(await requestsOf(bob, "incoming")).toEqual([
			expect.objectContaining({
				userId: alice.userId,
				username: alice.username,
				nickname: alice.username,
				avatarUrl: null,
			}),
		]);
		expect(await requestsOf(alice, "outgoing")).toEqual([
			expect.objectContaining({ userId: bob.userId }),
		]);
		expect(await requestsOf(alice, "incoming")).toEqual([]);
		expect((await search(alice, bob.username))[0]?.relation).toBe("requested");
		expect((await search(bob, alice.username))[0]?.relation).toBe(
			"requested-you",
		);

		await bob.client
			.post(`/api/friend-requests/${alice.userId}/accept`)
			.expect(204);

		expect(await friendsOf(alice)).toEqual([
			expect.objectContaining({ userId: bob.userId, username: bob.username }),
		]);
		expect(await friendsOf(bob)).toEqual([
			expect.objectContaining({ userId: alice.userId }),
		]);
		expect(await requestsOf(bob, "incoming")).toEqual([]);
		expect((await search(bob, alice.username))[0]?.relation).toBe("friend");

		await alice.client.delete(`/api/friends/${bob.userId}`).expect(204);

		expect(await friendsOf(alice)).toEqual([]);
		expect(await friendsOf(bob)).toEqual([]);
		const again = await alice.client
			.delete(`/api/friends/${bob.userId}`)
			.expect(404);
		expect(problemOf(again).code).toBe("social.not-friends");
	});

	it("befriends two players who ask each other at once, once", async () => {
		const [carol, dave] = [await player(), await player()];

		const answers = await Promise.all([ask(carol, dave), ask(dave, carol)]);

		expect(answers.map(({ status }) => status).sort()).toEqual([
			"befriended",
			"requested",
		]);
		expect(await friendsOf(carol)).toHaveLength(1);
		expect(await friendsOf(dave)).toHaveLength(1);
		expect(await requestsOf(carol, "incoming")).toEqual([]);
		expect(await requestsOf(dave, "incoming")).toEqual([]);
	});

	it("lets the one asked decline, and the one asking cancel", async () => {
		const [erin, frank, grace] = [
			await player(),
			await player(),
			await player(),
		];
		await ask(erin, frank);
		await ask(erin, grace);

		await frank.client
			.post(`/api/friend-requests/${erin.userId}/decline`)
			.expect(204);
		await erin.client
			.delete(`/api/friend-requests/${grace.userId}`)
			.expect(204);

		expect(await requestsOf(erin, "outgoing")).toEqual([]);
		expect(await requestsOf(grace, "incoming")).toEqual([]);
		expect(await friendsOf(frank)).toEqual([]);
		const gone = await grace.client
			.post(`/api/friend-requests/${erin.userId}/accept`)
			.expect(404);
		expect(problemOf(gone).code).toBe("social.request-not-found");
	});

	it("refuses requests to oneself, to strangers' names and twice", async () => {
		const [heidi, ivan] = [await player(), await player()];
		const codeOf = async (from: Player, username: string, status: number) =>
			problemOf(
				await from.client
					.post("/api/friend-requests", { username })
					.expect(status),
			).code;

		expect(await codeOf(heidi, heidi.username, 422)).toBe(
			"social.self-request",
		);
		expect(await codeOf(heidi, "nobody_here_at_all", 404)).toBe(
			"social.player-not-found",
		);
		await ask(heidi, ivan);
		expect(await codeOf(heidi, ivan.username, 409)).toBe(
			"social.request-pending",
		);
	});

	it("searches by a username's beginning, without the one searching", async () => {
		const judy = await player();
		// Every test account's username starts so; there are more than ten of them by now.
		const prefix = "user_";

		const found = await search(judy, prefix);

		expect(found.length).toBeGreaterThan(0);
		expect(found.length).toBeLessThanOrEqual(10);
		expect(found.every(({ username }) => username.startsWith(prefix))).toBe(
			true,
		);
		expect(found.some(({ userId }) => userId === judy.userId)).toBe(false);
		await judy.client.get("/api/players/search?q=a%25").expect(400);
	});

	it("is for signed-in players only", async () => {
		const stranger = browser(app);

		await stranger.get("/api/friends").expect(401);
		await stranger.get("/api/players/search?q=a").expect(401);
		await stranger
			.post("/api/friend-requests", { username: "someone" })
			.expect(401);
	});
});
