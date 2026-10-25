import { MeResponse } from "@holdem/shared/contracts/identity";
import {
	Controller,
	Get,
	type INestApplication,
	UseGuards,
} from "@nestjs/common";
import { EventBus, type IEvent, ofType } from "@nestjs/cqrs";
import { eq } from "drizzle-orm";
import { filter, firstValueFrom } from "rxjs";
import request from "supertest";
import type { App } from "supertest/types.js";
import { UserRegistered, UserVerified } from "@/modules/identity/index.js";
import {
	BETTER_AUTH,
	type BetterAuth,
	EMAIL_VERIFICATION_EXPIRES_IN,
} from "@/modules/identity/infrastructure/better-auth.js";
import { emailCooldownKey } from "@/modules/identity/infrastructure/email-cooldown.js";
import { users } from "@/modules/identity/infrastructure/persistence/schema.js";
import type { Viewer } from "@/shared/application/viewer.js";
import type { AppConfig } from "@/shared/infrastructure/config/index.js";
import { REDIS, type Redis } from "@/shared/infrastructure/redis/index.js";
import { AuthGuard, CurrentUser } from "@/shared/presentation/auth.guard.js";
import { RequireVerified } from "@/shared/presentation/require-verified.guard.js";
import { createTestApp } from "./support/create-test-app.js";
import { exampleConfig } from "./support/example-config.js";
import {
	type Browser,
	browser,
	newAccount,
	PASSWORD,
	problemOf,
	sessionCookieOf,
	signUpAndVerify,
	verificationLinkFor,
	WEB_ORIGIN,
} from "./support/identity.js";
import { countEmails, waitForEmailCount } from "./support/mailpit.js";
import {
	createTestDatabase,
	type TestDatabase,
} from "./support/test-database.js";

/** A route only verified users may reach, like the play endpoints to come. */
@Controller("probe")
class VerifiedOnlyController {
	@Get("verified-only")
	@UseGuards(AuthGuard, RequireVerified)
	enter(@CurrentUser() viewer: Viewer) {
		return { userId: viewer.userId };
	}
}

describe("Identity (e2e)", () => {
	let database: TestDatabase;
	let app: INestApplication<App>;

	beforeAll(async () => {
		database = await createTestDatabase();
		app = await createTestApp({
			config: { database: { url: database.url }, trustProxy: "loopback" },
			controllers: [VerifiedOnlyController],
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

	describe("the verification link", () => {
		const userOf = async (email: string) =>
			(
				await database.db.select().from(users).where(eq(users.email, email))
			)[0]!;

		it("leads to the web app, wherever the client asked to go", async () => {
			const withoutCallback = newAccount();
			const relative = newAccount();
			await browser(app)
				.post("/api/auth/sign-up/email", withoutCallback)
				.expect(200);
			await browser(app)
				.post("/api/auth/sign-up/email", {
					...relative,
					callbackURL: "/welcome",
				})
				.expect(200);

			const callbackOf = async (email: string) =>
				(await verificationLinkFor(email)).searchParams.get("callbackURL");
			expect(await callbackOf(withoutCallback.email)).toBe(`${WEB_ORIGIN}/`);
			expect(await callbackOf(relative.email)).toBe(`${WEB_ORIGIN}/welcome`);
		});

		it("publishes UserVerified when the user opens it", async () => {
			const client = browser(app);
			const account = newAccount();
			const signUp = await client
				.post("/api/auth/sign-up/email", account)
				.expect(200);
			const verified = firstValueFrom(
				app.get(EventBus).pipe(
					ofType(UserVerified),
					filter((event) => event.userId === signUp.body.user.id),
				),
			);

			const link = await verificationLinkFor(account.email);
			await client.get(`${link.pathname}${link.search}`).expect(302);

			expect(await verified).toEqual(new UserVerified(signUp.body.user.id));
		});

		it("is refused once expired, and creates no session", async () => {
			const client = browser(app);
			const account = newAccount();
			await client
				.post("/api/auth/sign-up/email", {
					...account,
					callbackURL: `${WEB_ORIGIN}/welcome`,
				})
				.expect(200);
			const link = await verificationLinkFor(account.email);

			// The app runs in this process, so its clock is the test's.
			vi.useFakeTimers({ toFake: ["Date"] });
			let response: request.Response;
			try {
				vi.setSystemTime(
					Date.now() + (EMAIL_VERIFICATION_EXPIRES_IN + 60) * 1000,
				);
				response = await client
					.get(`${link.pathname}${link.search}`)
					.expect(302);
			} finally {
				vi.useRealTimers();
			}

			expect(response.headers.location).toBe(
				`${WEB_ORIGIN}/welcome?error=TOKEN_EXPIRED`,
			);
			expect(sessionCookieOf(response)).toBeUndefined();
			expect((await userOf(account.email)).emailVerified).toBe(false);
		});

		it("is refused when tampered with, and creates no session", async () => {
			const own = newAccount();
			const victim = newAccount();
			await browser(app).post("/api/auth/sign-up/email", own).expect(200);
			await browser(app).post("/api/auth/sign-up/email", victim).expect(200);
			const link = await verificationLinkFor(own.email);

			// The token is a signed JWT: point its payload at another account, keep the signature.
			const [header, payload, signature] = link.searchParams
				.get("token")!
				.split(".");
			const claims = JSON.parse(Buffer.from(payload!, "base64url").toString());
			link.searchParams.set(
				"token",
				[
					header,
					Buffer.from(
						JSON.stringify({ ...claims, email: victim.email }),
					).toString("base64url"),
					signature,
				].join("."),
			);
			const response = await browser(app)
				.get(`${link.pathname}${link.search}`)
				.expect(302);

			expect(response.headers.location).toBe(
				`${WEB_ORIGIN}/?error=INVALID_TOKEN`,
			);
			expect(sessionCookieOf(response)).toBeUndefined();
			expect((await userOf(victim.email)).emailVerified).toBe(false);
		});

		it("signs in only once: opened again, it creates no session", async () => {
			const account = await signUpAndVerify(browser(app));
			const link = await verificationLinkFor(account.email);

			const response = await browser(app)
				.get(`${link.pathname}${link.search}`)
				.expect(302);

			expect(response.headers.location).toBe(`${WEB_ORIGIN}/`);
			expect(sessionCookieOf(response)).toBeUndefined();
		});
	});

	describe("sending the link again", () => {
		const redis = () => app.get<Redis>(REDIS);
		const resend = (client: Browser, email: string) =>
			client.post("/api/auth/send-verification-email", { email });
		/** Nothing more arrives: wait past the background delivery, then count. */
		const settle = () => new Promise((resolve) => setTimeout(resolve, 500));

		it("answers the same for an unknown, an unverified and a verified address", async () => {
			const unverified = newAccount();
			await browser(app)
				.post("/api/auth/sign-up/email", unverified)
				.expect(200);
			const verified = await signUpAndVerify(browser(app));

			const answers = await Promise.all(
				[newAccount().email, unverified.email, verified.email].map(
					async (email) => {
						const response = await resend(browser(app), email).expect(200);
						return response.body as unknown;
					},
				),
			);

			expect(answers).toEqual([
				{ status: true },
				{ status: true },
				{ status: true },
			]);
		});

		it("sends at most one email a minute to an address, whoever asks", async () => {
			const account = newAccount();
			await browser(app).post("/api/auth/sign-up/email", account).expect(200);
			await waitForEmailCount(account.email, 1);

			// From two other clients, so the per-IP limit does not explain the silence.
			await resend(browser(app), account.email).expect(200);
			await browser(app)
				.post("/api/auth/sign-in/email", {
					email: account.email,
					password: PASSWORD,
				})
				.expect(403);
			await settle();
			expect(await countEmails(account.email)).toBe(1);
			expect(
				await redis().ttl(emailCooldownKey("verify-email", account.email)),
			).toBeGreaterThan(50);

			// The minute is over.
			await redis().del(emailCooldownKey("verify-email", account.email));
			await resend(browser(app), account.email).expect(200);
			await waitForEmailCount(account.email, 2);

			await redis().del(emailCooldownKey("verify-email", account.email));
			await browser(app)
				.post("/api/auth/sign-in/username", {
					username: account.username,
					password: PASSWORD,
				})
				.expect(403);
			await waitForEmailCount(account.email, 3);
		});

		it("keeps no address in Redis", async () => {
			const account = newAccount();
			await browser(app).post("/api/auth/sign-up/email", account).expect(200);
			await waitForEmailCount(account.email, 1);

			const keys = await redis().keys("identity:email-cooldown:*");
			expect(keys).toContain(emailCooldownKey("verify-email", account.email));
			expect(keys.join()).not.toContain(account.email);
		});

		it("is rate limited per client", async () => {
			const client = browser(app);
			const statuses: number[] = [];
			for (let attempt = 1; attempt <= 4; attempt++) {
				statuses.push((await resend(client, newAccount().email)).status);
			}

			expect(statuses).toEqual([200, 200, 200, 429]);
		});

		it("refuses a callback URL on another site", async () => {
			const response = await browser(app)
				.post("/api/auth/send-verification-email", {
					email: newAccount().email,
					callbackURL: "https://evil.example/",
				})
				.expect(403);

			expect(problemOf(response).code).toBe("auth.invalid-callback-url");
		});
	});

	describe("routes for verified users only", () => {
		it("let a verified user in", async () => {
			const client = browser(app);
			await signUpAndVerify(client);

			await client.get("/api/probe/verified-only").expect(200);
		});

		it("refuse a session whose email is not verified, as an OAuth provider may hand out", async () => {
			const client = browser(app);
			const account = await signUpAndVerify(client);
			await database.db
				.update(users)
				.set({ emailVerified: false })
				.where(eq(users.email, account.email));

			const response = await client.get("/api/probe/verified-only").expect(403);

			expect(problemOf(response).code).toBe("auth.email-not-verified");
			await client.get("/api/me").expect(200);
		});

		it("publish UserVerified at once for an account created with a verified email", async () => {
			const events: IEvent[] = [];
			const subscription = app.get(EventBus).subscribe((event) => {
				events.push(event);
			});
			const account = newAccount();

			// What an OAuth sign-in does when the provider vouches for the email.
			const { internalAdapter } =
				await app.get<BetterAuth>(BETTER_AUTH).$context;
			const created = await internalAdapter.createUser(
				{
					email: account.email,
					name: account.username.toLowerCase(),
					username: account.username.toLowerCase(),
					emailVerified: true,
				},
				{ method: "oauth" },
			);

			await vi.waitFor(() =>
				expect(events).toContainEqual(new UserVerified(created.id as never)),
			);
			subscription.unsubscribe();
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
