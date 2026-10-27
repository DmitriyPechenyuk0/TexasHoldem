import type { INestApplication } from "@nestjs/common";
import { EventBus, ofType } from "@nestjs/cqrs";
import { eq } from "drizzle-orm";
import { filter, firstValueFrom } from "rxjs";
import type { App } from "supertest/types.js";
import { UserVerified } from "@/modules/identity/index.js";
import { PASSWORD_RESET_EXPIRES_IN } from "@/modules/identity/infrastructure/better-auth.js";
import { emailThrottleKeys } from "@/modules/identity/infrastructure/email-throttle.js";
import { users } from "@/modules/identity/infrastructure/persistence/schema.js";
import { RateLimiter } from "@/shared/application/rate-limiter.js";
import { captureLogs } from "./support/capture-logs.js";
import {
	createTestApp,
	FakePasswordBreaches,
} from "./support/create-test-app.js";
import {
	type Account,
	type Browser,
	browser,
	newAccount,
	PASSWORD,
	pathOf,
	problemOf,
	signUpAndVerify,
	WEB_ORIGIN,
} from "./support/identity.js";
import {
	countEmails,
	waitForEmailCount,
	waitForLink,
} from "./support/mailpit.js";
import {
	createTestDatabase,
	type TestDatabase,
} from "./support/test-database.js";

const NEW_PASSWORD = "a brand new passphrase";
const RESET_PAGE = `${WEB_ORIGIN}/en/reset-password`;

const resetLinkFor = (email: string): Promise<URL> =>
	waitForLink(email, /https?:\/\/\S+\/api\/auth\/reset-password\/\S+/);

describe("Password reset (e2e)", () => {
	let database: TestDatabase;
	let app: INestApplication<App>;
	const breaches = new FakePasswordBreaches();

	beforeAll(async () => {
		database = await createTestDatabase();
		app = await createTestApp({
			config: { database: { url: database.url }, trustProxy: "loopback" },
			passwordBreaches: breaches,
		});
	});

	afterAll(async () => {
		await app?.close();
		await database?.drop();
	});

	const requestReset = (
		client: Browser,
		email: string,
		redirectTo: string = RESET_PAGE,
	) => client.post("/api/auth/request-password-reset", { email, redirectTo });

	/** Requests a reset and follows the emailed link to the web page; returns the token it carries. */
	async function tokenFor(account: Account): Promise<string> {
		await requestReset(browser(app), account.email).expect(200);
		const page = await followLink(await resetLinkFor(account.email));
		expect(`${page.origin}${page.pathname}`).toBe(RESET_PAGE);
		return page.searchParams.get("token")!;
	}

	async function followLink(link: URL): Promise<URL> {
		const response = await browser(app).get(pathOf(link)).expect(302);
		return new URL(response.headers.location!);
	}

	const resetPassword = (token: string, newPassword = NEW_PASSWORD) =>
		browser(app).post("/api/auth/reset-password", { token, newPassword });

	const signIn = (account: Account, password: string) =>
		browser(app).post("/api/auth/sign-in/email", {
			email: account.email,
			password,
		});

	const clearCooldown = (email: string) =>
		app
			.get(RateLimiter)
			.reset(emailThrottleKeys("reset-password", email).minute);

	it("sets a new password through the emailed link and signs every session out", async () => {
		const first = browser(app);
		const account = await signUpAndVerify(first);
		const second = browser(app);
		await second
			.post("/api/auth/sign-in/email", {
				email: account.email,
				password: PASSWORD,
			})
			.expect(200);

		const response = await resetPassword(await tokenFor(account)).expect(200);

		expect(response.body).toEqual({ status: true });
		await first.get("/api/me").expect(401);
		await second.get("/api/me").expect(401);
		expect(problemOf(await signIn(account, PASSWORD).expect(401)).code).toBe(
			"auth.invalid-email-or-password",
		);
		await signIn(account, NEW_PASSWORD).expect(200);
		// The owner hears of it, in case it was not them.
		await waitForLink(account.email, /\S+\/en\/settings\?tab=account/);
	});

	it("keeps the link's token, which is in its path, out of the logs", async () => {
		const account = await signUpAndVerify(browser(app));
		await requestReset(browser(app), account.email).expect(200);
		const link = await resetLinkFor(account.email);
		const token = link.pathname.split("/").at(-1)!;
		const { lines } = captureLogs();

		await followLink(link);

		expect(JSON.stringify(lines)).not.toContain(token);
		expect(lines).toContainEqual(
			expect.objectContaining({
				msg: "request completed",
				req: expect.objectContaining({
					path: "/api/auth/reset-password/[redacted]",
				}),
			}),
		);
	});

	it("refuses a new password from a known data breach, and keeps the link usable", async () => {
		const account = await signUpAndVerify(browser(app));
		const token = await tokenFor(account);
		breaches.breached.add("leaked passphrase");

		const refused = await resetPassword(token, "leaked passphrase").expect(400);

		expect(problemOf(refused).code).toBe("auth.password-compromised");
		await resetPassword(token).expect(200);
	});

	it("refuses a used link with a stable code", async () => {
		const account = await signUpAndVerify(browser(app));
		const link = await (async () => {
			await requestReset(browser(app), account.email).expect(200);
			return resetLinkFor(account.email);
		})();
		const token = (await followLink(link)).searchParams.get("token")!;
		await resetPassword(token).expect(200);

		const again = await resetPassword(token, "yet another passphrase").expect(
			400,
		);

		expect(problemOf(again).code).toBe("auth.invalid-token");
		const page = await followLink(link);
		expect(page.href).toBe(`${RESET_PAGE}?error=INVALID_TOKEN`);
		await signIn(account, NEW_PASSWORD).expect(200);
	});

	it("refuses a link older than an hour with the same code", async () => {
		const account = await signUpAndVerify(browser(app));
		const token = await tokenFor(account);

		// The app runs in this process, so its clock is the test's.
		vi.useFakeTimers({ toFake: ["Date"] });
		try {
			vi.setSystemTime(Date.now() + (PASSWORD_RESET_EXPIRES_IN + 60) * 1000);
			const response = await resetPassword(token).expect(400);
			expect(problemOf(response).code).toBe("auth.invalid-token");
		} finally {
			vi.useRealTimers();
		}
		await signIn(account, PASSWORD).expect(200);
	});

	it("kills every other reset link of the account once one is used", async () => {
		const account = await signUpAndVerify(browser(app));
		const older = await tokenFor(account);
		await clearCooldown(account.email);
		await requestReset(browser(app), account.email).expect(200);
		await waitForEmailCount(account.email, 3);
		const newer = (
			await followLink(await resetLinkFor(account.email))
		).searchParams.get("token")!;
		expect(newer).not.toBe(older);

		await resetPassword(newer).expect(200);

		expect(problemOf(await resetPassword(older).expect(400)).code).toBe(
			"auth.invalid-token",
		);
	});

	it("answers the same, and as slowly, whether or not the address has an account", async () => {
		const account = await signUpAndVerify(browser(app));
		const unknown = newAccount().email;

		const timed = async (email: string) => {
			const startedAt = Date.now();
			const response = await requestReset(browser(app), email).expect(200);
			return { body: response.body as unknown, ms: Date.now() - startedAt };
		};
		const [known, missing] = [await timed(account.email), await timed(unknown)];

		expect(missing.body).toEqual(known.body);
		expect(known.ms).toBeGreaterThanOrEqual(500);
		expect(missing.ms).toBeGreaterThanOrEqual(500);
		await waitForEmailCount(account.email, 2);
		expect(await countEmails(unknown)).toBe(0);
	});

	it("sends at most one reset email a minute to an address", async () => {
		const account = await signUpAndVerify(browser(app));

		await requestReset(browser(app), account.email).expect(200);
		await requestReset(browser(app), account.email).expect(200);
		await waitForEmailCount(account.email, 2);
		// Wait past the background delivery of a second reset email, if there were one.
		await new Promise((resolve) => setTimeout(resolve, 500));

		expect(await countEmails(account.email)).toBe(2);
	});

	it("is rate limited per client", async () => {
		const client = browser(app);
		const statuses: number[] = [];
		for (let attempt = 1; attempt <= 4; attempt++) {
			statuses.push((await requestReset(client, newAccount().email)).status);
		}

		expect(statuses).toEqual([200, 200, 200, 429]);
	});

	it("verifies the email of an account that never opened its verification link", async () => {
		const account = newAccount();
		const signUp = await browser(app)
			.post("/api/auth/sign-up/email", account)
			.expect(200);
		const verified = firstValueFrom(
			app.get(EventBus).pipe(
				ofType(UserVerified),
				filter((event) => event.userId === signUp.body.user.id),
			),
		);

		await resetPassword(await tokenFor(account)).expect(200);

		expect(await verified).toEqual(new UserVerified(signUp.body.user.id));
		const [user] = await database.db
			.select()
			.from(users)
			.where(eq(users.email, account.email));
		expect(user?.emailVerified).toBe(true);
		await signIn(account, NEW_PASSWORD).expect(200);
	});

	it("leads only to the web app", async () => {
		const account = await signUpAndVerify(browser(app));

		const foreign = await requestReset(
			browser(app),
			account.email,
			"https://evil.example/reset",
		).expect(403);
		expect(problemOf(foreign).code).toBe("auth.invalid-callback-url");

		const missing = await browser(app)
			.post("/api/auth/request-password-reset", { email: account.email })
			.expect(400);
		expect(problemOf(missing).code).toBe("request.invalid");

		await requestReset(
			browser(app),
			account.email,
			"/ru/reset-password",
		).expect(200);
		const page = await followLink(await resetLinkFor(account.email));
		expect(`${page.origin}${page.pathname}`).toBe(
			`${WEB_ORIGIN}/ru/reset-password`,
		);
	});

	it("holds the new password to the sign-up rules", async () => {
		const account = await signUpAndVerify(browser(app));
		const token = await tokenFor(account);

		const response = await resetPassword(token, "short").expect(400);

		expect(problemOf(response).errors?.map((error) => error.path)).toEqual([
			["newPassword"],
		]);
		await resetPassword(token).expect(200);
	});
});
