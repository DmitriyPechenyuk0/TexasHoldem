import { MeResponse } from "@holdem/shared/contracts/identity";
import {
	MyProfileResponse,
	PublicProfileResponse,
} from "@holdem/shared/contracts/profile";
import type { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import type { App } from "supertest/types.js";
import { profiles } from "@/modules/profile/infrastructure/persistence/schema.js";
import { createTestApp } from "./support/create-test-app.js";
import {
	type Browser,
	browser,
	newAccount,
	problemOf,
	signUpAndVerify,
} from "./support/identity.js";
import {
	createTestDatabase,
	type TestDatabase,
} from "./support/test-database.js";

describe("Profile (e2e)", () => {
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

	/** A verified, signed-in player and their username as stored (lowercase). */
	async function player(): Promise<{ client: Browser; username: string }> {
		const client = browser(app);
		const account = await signUpAndVerify(client);
		return { client, username: account.username.toLowerCase() };
	}

	it("exists right after sign-up, with the username as nickname and the sign-up locale", async () => {
		const account = newAccount();

		const signUp = await browser(app)
			.post("/api/auth/sign-up/email", { ...account, locale: "ru" })
			.expect(200);

		// Created by the UserRegistered handler, a moment after the answer.
		await vi.waitFor(async () => {
			const [profile] = await database.db
				.select()
				.from(profiles)
				.where(eq(profiles.userId, signUp.body.user.id));
			expect(profile).toMatchObject({
				username: account.username.toLowerCase(),
				nickname: account.username.toLowerCase(),
				avatarKey: null,
				locale: "ru",
			});
		});
	});

	it("is shown to its owner, and only to a signed-in one", async () => {
		const { client, username } = await player();

		const response = await client.get("/api/profile").expect(200);

		expect(MyProfileResponse.parse(response.body)).toMatchObject({
			username,
			nickname: username,
			locale: "en",
		});
		expect(
			problemOf(await browser(app).get("/api/profile").expect(401)).code,
		).toBe("auth.unauthenticated");
	});

	it("takes a new nickname, trimmed, and answers the stored profile", async () => {
		const { client } = await player();

		const response = await client
			.put("/api/profile/nickname", { nickname: "  Ace   of Spades " })
			.expect(200);

		expect(MyProfileResponse.parse(response.body).nickname).toBe(
			"Ace of Spades",
		);
		expect((await client.get("/api/profile").expect(200)).body.nickname).toBe(
			"Ace of Spades",
		);
	});

	it.each([
		["x", "profile.nickname-too-short", { min: 2 }],
		["x".repeat(25), "profile.nickname-too-long", { max: 24 }],
		["ace ♠", "profile.nickname-invalid-characters", undefined],
	])("refuses the nickname %j with 422 %s", async (nickname, code, params) => {
		const { client, username } = await player();

		const response = await client
			.put("/api/profile/nickname", { nickname })
			.expect(422);

		expect(problemOf(response)).toMatchObject(
			params ? { code, params } : { code },
		);
		expect((await client.get("/api/profile").expect(200)).body.nickname).toBe(
			username,
		);
	});

	it("refuses a body without a nickname as an invalid request", async () => {
		const { client } = await player();

		const response = await client.put("/api/profile/nickname", {}).expect(400);

		expect(problemOf(response).code).toBe("request.invalid");
	});

	it("changes the locale of the profile and of the player's emails", async () => {
		const { client } = await player();

		const response = await client
			.put("/api/profile/locale", { locale: "ru" })
			.expect(200);

		expect(MyProfileResponse.parse(response.body).locale).toBe("ru");
		const me = MeResponse.parse((await client.get("/api/me").expect(200)).body);
		expect(me.locale).toBe("ru");
		expect(
			problemOf(
				await client.put("/api/profile/locale", { locale: "de" }).expect(400),
			).code,
		).toBe("request.invalid");
	});

	it("shows anyone the public part of a profile, by username in any case", async () => {
		const { client, username } = await player();
		await client
			.put("/api/profile/nickname", { nickname: "Alice" })
			.expect(200);

		const response = await browser(app)
			.get(`/api/profiles/${username.toUpperCase()}`)
			.expect(200);

		expect(Object.keys(response.body).sort()).toEqual([
			"createdAt",
			"nickname",
			"username",
		]);
		expect(PublicProfileResponse.parse(response.body)).toMatchObject({
			username,
			nickname: "Alice",
		});
	});

	it("answers profile.not-found to a player whose profile is missing", async () => {
		// A UserRegistered whose handler failed, say with the database away for a moment.
		const { client, username } = await player();
		await database.db.delete(profiles).where(eq(profiles.username, username));

		const rename = await client
			.put("/api/profile/nickname", { nickname: "Alice" })
			.expect(404);
		const read = await client.get("/api/profile").expect(404);

		expect(problemOf(rename).code).toBe("profile.not-found");
		expect(problemOf(read).code).toBe("profile.not-found");
	});

	it("answers 404 for an unknown username and 400 for one that cannot exist", async () => {
		const unknown = await browser(app)
			.get("/api/profiles/nobody_here")
			.expect(404);
		const invalid = await browser(app)
			.get("/api/profiles/no%20spaces")
			.expect(400);

		expect(problemOf(unknown).code).toBe("profile.not-found");
		expect(problemOf(invalid).code).toBe("request.invalid");
	});
});
