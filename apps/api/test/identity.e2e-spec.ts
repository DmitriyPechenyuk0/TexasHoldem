import { randomUUID } from "node:crypto";
import { Problem, PROBLEM_CONTENT_TYPE } from "@holdem/shared";
import { MeResponse } from "@holdem/shared/contracts/identity";
import type { INestApplication } from "@nestjs/common";
import { EventBus, ofType } from "@nestjs/cqrs";
import { eq } from "drizzle-orm";
import { firstValueFrom } from "rxjs";
import request from "supertest";
import type { App } from "supertest/types.js";
import { UserRegistered } from "@/modules/identity/index.js";
import {
	BETTER_AUTH,
	type BetterAuth,
} from "@/modules/identity/infrastructure/better-auth.js";
import { users } from "@/modules/identity/infrastructure/persistence/schema.js";
import type { AppConfig } from "@/shared/infrastructure/config/index.js";
import { createTestApp } from "./support/create-test-app.js";
import { exampleConfig } from "./support/example-config.js";
import { waitForEmail } from "./support/mailpit.js";
import {
	createTestDatabase,
	type TestDatabase,
} from "./support/test-database.js";

const WEB_ORIGIN = exampleConfig().webOrigin;
const PASSWORD = "correct horse battery";

const problemOf = (response: request.Response): Problem => {
	expect(response.headers["content-type"]).toMatch(
		new RegExp(`^${PROBLEM_CONTENT_TYPE.replace("+", "\\+")}`),
	);
	return Problem.parse(response.body);
};

/** A new account's details, unique per call: every test shares one database and Mailpit. */
const newAccount = () => {
	const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
	return {
		username: `User_${suffix}`,
		email: `user.${suffix}@example.test`,
		password: PASSWORD,
	};
};

let lastAddress = 0;

/**
 * One browser: its own cookies and, through TRUST_PROXY, its own client address, so the rate
 * limits of one test never spill into another.
 */
function browser(app: INestApplication<App>) {
	const agent = request.agent(app.getHttpServer());
	const ip = `203.0.113.${++lastAddress}`;
	const authed = <T extends request.Test>(test: T): T =>
		test.set("X-Forwarded-For", ip).set("Origin", WEB_ORIGIN) as T;
	return {
		ip,
		get: (path: string) => authed(agent.get(path)),
		post: (path: string, body?: object) =>
			authed(agent.post(path)).send(body ?? {}),
	};
}
type Browser = ReturnType<typeof browser>;

const sessionCookieOf = (response: request.Response): string | undefined =>
	([] as string[])
		.concat(response.headers["set-cookie"] ?? [])
		.find((cookie) => /^(__Secure-)?holdem\.session_token=[^;]+/.test(cookie));

/** The verification link from the email Mailpit caught, as a path on the api. */
async function verificationLinkFor(email: string): Promise<URL> {
	const message = await waitForEmail(email);
	const link = /https?:\/\/\S+\/api\/auth\/verify-email\?\S+/.exec(
		message.Text,
	)?.[0];
	expect(link).toBeDefined();
	return new URL(link!);
}

/** Signs up and opens the link from the email, which signs the browser in. */
async function signUpAndVerify(
	client: Browser,
	account = newAccount(),
): Promise<typeof account> {
	await client.post("/api/auth/sign-up/email", account).expect(200);
	const link = await verificationLinkFor(account.email);
	await client.get(`${link.pathname}${link.search}`).expect(302);
	return account;
}

describe("Identity (e2e)", () => {
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

	describe("signing up, verifying, signing in and out", () => {
		it("lets a user in only after they open the link from the email", async () => {
			const client = browser(app);
			const account = newAccount();
			const registered = firstValueFrom(
				app.get(EventBus).pipe(ofType(UserRegistered)),
			);

			const signUp = await client
				.post("/api/auth/sign-up/email", {
					...account,
					locale: "ru",
					callbackURL: `${WEB_ORIGIN}/welcome`,
				})
				// A forged Host must not leak into the emailed link.
				.set("Host", "evil.example")
				.expect(200);
			expect(sessionCookieOf(signUp)).toBeUndefined();
			expect(await registered).toEqual(
				new UserRegistered(
					signUp.body.user.id,
					account.username.toLowerCase(),
					"ru",
				),
			);

			const refused = await client
				.post("/api/auth/sign-in/email", {
					email: account.email,
					password: PASSWORD,
				})
				.expect(403);
			expect(problemOf(refused)).toMatchObject({
				code: "auth.email-not-verified",
			});
			expect(sessionCookieOf(refused)).toBeUndefined();

			const link = await verificationLinkFor(account.email);
			expect(link.origin).toBe(exampleConfig().apiOrigin);
			const verified = await client
				.get(`${link.pathname}${link.search}`)
				.expect(302);
			expect(verified.headers.location).toBe(`${WEB_ORIGIN}/welcome`);
			expect(sessionCookieOf(verified)).toBeDefined();

			const me = await client.get("/api/me").expect(200);
			expect(MeResponse.parse(me.body)).toEqual({
				id: signUp.body.user.id,
				username: account.username.toLowerCase(),
				email: account.email,
				emailVerified: true,
				locale: "ru",
			});

			await client.post("/api/auth/sign-out").expect(200);
			const signedOut = await client.get("/api/me").expect(401);
			expect(problemOf(signedOut)).toMatchObject({
				code: "auth.unauthenticated",
			});
		});

		it("signs in with the username in any case, or with the email", async () => {
			const account = await signUpAndVerify(browser(app));

			const byUsername = browser(app);
			const response = await byUsername
				.post("/api/auth/sign-in/username", {
					username: account.username.toUpperCase(),
					password: PASSWORD,
				})
				.expect(200);
			expect(sessionCookieOf(response)).toBeDefined();
			await byUsername.get("/api/me").expect(200);

			const byEmail = browser(app);
			await byEmail
				.post("/api/auth/sign-in/email", {
					email: account.email,
					password: PASSWORD,
				})
				.expect(200);
			await byEmail.get("/api/me").expect(200);
		});

		it("refuses a wrong password with a stable code", async () => {
			const account = await signUpAndVerify(browser(app));

			const response = await browser(app)
				.post("/api/auth/sign-in/username", {
					username: account.username,
					password: "wrong password!",
				})
				.expect(401);

			expect(problemOf(response)).toMatchObject({
				code: "auth.invalid-username-or-password",
				instance: "/api/auth/sign-in/username",
				requestId: expect.any(String),
			});
		});

		it("answers /api/me with 401 without a session", async () => {
			const response = await browser(app).get("/api/me").expect(401);

			expect(problemOf(response).code).toBe("auth.unauthenticated");
		});
	});

	describe("sign-up rules", () => {
		it("refuses a taken username, in any case, with a stable code", async () => {
			const taken = await signUpAndVerify(browser(app));

			const response = await browser(app)
				.post("/api/auth/sign-up/email", {
					...newAccount(),
					username: taken.username.toUpperCase(),
				})
				.expect(400);

			expect(problemOf(response).code).toBe("auth.username-is-already-taken");
		});

		it("answers a taken email exactly like a new one and leaves the account as it was", async () => {
			const taken = await signUpAndVerify(browser(app));
			const [before] = await database.db
				.select()
				.from(users)
				.where(eq(users.email, taken.email));

			const fresh = await browser(app)
				.post("/api/auth/sign-up/email", newAccount())
				.expect(200);
			const again = await browser(app)
				.post("/api/auth/sign-up/email", {
					...newAccount(),
					email: taken.email,
					password: "another password",
				})
				.expect(200);

			const shape = (body: { user: object }) => ({
				keys: Object.keys(body).sort(),
				user: Object.entries(body.user)
					.map(([key, value]) => `${key}:${typeof value}`)
					.sort(),
			});
			expect(shape(again.body)).toEqual(shape(fresh.body));
			expect(again.body.token).toBeNull();

			const [after] = await database.db
				.select()
				.from(users)
				.where(eq(users.email, taken.email));
			expect(after).toEqual(before);
			await browser(app)
				.post("/api/auth/sign-in/email", {
					email: taken.email,
					password: PASSWORD,
				})
				.expect(200);
		});

		it("ignores fields a client must not set", async () => {
			const account = newAccount();

			await browser(app)
				.post("/api/auth/sign-up/email", {
					...account,
					emailVerified: true,
					image: "javascript:alert(1)",
					name: "Administrator",
					role: "admin",
				})
				.expect(200);

			const [user] = await database.db
				.select()
				.from(users)
				.where(eq(users.email, account.email));
			expect(user).toMatchObject({
				emailVerified: false,
				image: null,
				name: account.username.toLowerCase(),
				locale: "en",
			});
		});

		it("ignores those fields in server-side sign-ups too, which skip the HTTP contract", async () => {
			const account = newAccount();

			await app.get<BetterAuth>(BETTER_AUTH).api.signUpEmail({
				body: {
					...account,
					name: "Administrator",
					emailVerified: true,
					image: "javascript:alert(1)",
				} as NonNullable<
					Parameters<BetterAuth["api"]["signUpEmail"]>[0]
				>["body"],
			});

			const [user] = await database.db
				.select()
				.from(users)
				.where(eq(users.email, account.email));
			expect(user).toMatchObject({
				emailVerified: false,
				image: null,
				name: account.username.toLowerCase(),
			});
		});

		it("refuses a sign-in without a body", async () => {
			const response = await browser(app)
				.post("/api/auth/sign-in/email")
				.expect(400);

			expect(problemOf(response)).toMatchObject({ code: "request.invalid" });
		});

		it("lists every invalid field", async () => {
			const response = await browser(app)
				.post("/api/auth/sign-up/email", {
					username: "no spaces",
					email: "not-an-email",
					password: "short",
				})
				.expect(400);

			const problem = problemOf(response);
			expect(problem.code).toBe("request.invalid");
			expect(problem.errors?.map((error) => error.path.join("."))).toEqual([
				"username",
				"email",
				"password",
			]);
		});

		it.each([
			"https://evil.example/welcome",
			"//evil.example/welcome",
			"http://[",
		])("refuses the callback URL %s", async (callbackURL) => {
			const response = await browser(app)
				.post("/api/auth/sign-up/email", { ...newAccount(), callbackURL })
				.expect(403);

			expect(problemOf(response).code).toBe("auth.invalid-callback-url");
		});
	});

	describe("requests a browser must not be able to forge", () => {
		it("refuses a sign-in from another origin (login CSRF)", async () => {
			const response = await browser(app)
				.post("/api/auth/sign-in/email", {
					email: "victim@example.test",
					password: PASSWORD,
				})
				.set("Origin", "https://evil.example")
				.expect(403);

			expect(problemOf(response).code).toBe("request.cross-origin");
		});

		it.each([
			[
				"an HTML form",
				"application/x-www-form-urlencoded",
				"email=a%40b.c&password=x",
			],
			[
				"text/plain",
				"text/plain",
				JSON.stringify({ email: "a@b.c", password: "x" }),
			],
		])("refuses a body sent as %s", async (_, contentType, body) => {
			const response = await browser(app)
				.post("/api/auth/sign-in/email")
				.set("Content-Type", contentType)
				.send(body)
				.expect(415);

			expect(problemOf(response).code).toBe("request.unsupported-media-type");
		});

		it("refuses a body over 16 KiB", async () => {
			const response = await browser(app)
				.post("/api/auth/sign-up/email", {
					...newAccount(),
					username: "x".repeat(17 * 1024),
				})
				.expect(413);

			expect(problemOf(response).code).toBe("request.too-large");
		});

		it("serves no endpoint that is disabled", async () => {
			const client = browser(app);
			await signUpAndVerify(client);

			const response = await client
				.post("/api/auth/update-user", { image: "javascript:alert(1)" })
				.expect(404);

			expect(problemOf(response).code).toBe("http.not-found");
		});
	});

	describe("the session cookie", () => {
		it("is HttpOnly and SameSite=Lax, and not Secure over plain HTTP in development", async () => {
			const client = browser(app);
			const account = newAccount();
			await client.post("/api/auth/sign-up/email", account).expect(200);
			const link = await verificationLinkFor(account.email);

			const cookie = sessionCookieOf(
				await client.get(`${link.pathname}${link.search}`).expect(302),
			);

			expect(cookie).toMatch(/^holdem\.session_token=/);
			expect(cookie).toMatch(/; HttpOnly/i);
			expect(cookie).toMatch(/; SameSite=Lax/i);
			expect(cookie).toMatch(/; Path=\//i);
			expect(cookie).not.toMatch(/; Secure/i);
		});
	});
});

describe("Identity in production (e2e)", () => {
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

	it("names the session cookie __Secure- and marks it Secure", async () => {
		// Production requires STARTTLS for email, which Mailpit lacks: verify in the database instead.
		const client = browser(app);
		const account = newAccount();
		await client.post("/api/auth/sign-up/email", account).expect(200);
		await database.db
			.update(users)
			.set({ emailVerified: true })
			.where(eq(users.email, account.email));

		const response = await client
			.post("/api/auth/sign-in/email", {
				email: account.email,
				password: PASSWORD,
			})
			.expect(200);

		const cookie = sessionCookieOf(response);
		expect(cookie).toMatch(/^__Secure-holdem\.session_token=/);
		expect(cookie).toMatch(/; Secure/i);
	});

	it("keeps one rate-limit bucket however the client rewrites X-Forwarded-For", async () => {
		// TRUST_PROXY is off: the api is reached directly, so the header is the client's own words.
		const statuses: number[] = [];
		for (let attempt = 1; attempt <= 4; attempt++) {
			// A path no other test here signs in on, so the bucket starts empty.
			const response = await request(app.getHttpServer())
				.post("/api/auth/sign-in/username")
				.set("Origin", WEB_ORIGIN)
				.set("X-Forwarded-For", `198.51.100.${attempt}`)
				.send({ username: "victim", password: `guess number ${attempt}` });
			statuses.push(response.status);
		}

		expect(statuses).toEqual([401, 401, 401, 429]);
	});
});
