import type { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import type { App } from "supertest/types.js";
import { accounts } from "@/modules/identity/infrastructure/persistence/schema.js";
import {
	createTestApp,
	FakePasswordBreaches,
} from "./support/create-test-app.js";
import {
	browser,
	PASSWORD,
	problemOf,
	sessionCookieOf,
	signUpAndVerify,
} from "./support/identity.js";
import { waitForLink } from "./support/mailpit.js";
import {
	createTestDatabase,
	type TestDatabase,
} from "./support/test-database.js";

const NEW_PASSWORD = "a brand new passphrase";

describe("Changing the password (e2e)", () => {
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

	const signIn = (email: string, password: string) =>
		browser(app).post("/api/auth/sign-in/email", { email, password });

	it("takes the new password, keeps this browser signed in and signs every other one out", async () => {
		const client = browser(app);
		const account = await signUpAndVerify(client);
		const elsewhere = browser(app);
		await elsewhere
			.post("/api/auth/sign-in/email", {
				email: account.email,
				password: PASSWORD,
			})
			.expect(200);

		const changed = await client
			.post("/api/auth/change-password", {
				currentPassword: PASSWORD,
				newPassword: NEW_PASSWORD,
				// Asked to keep them: the contract ends them anyway.
				revokeOtherSessions: false,
			})
			.expect(200);

		expect(sessionCookieOf(changed)).toBeDefined();
		await client.get("/api/me").expect(200);
		await elsewhere.get("/api/me").expect(401);
		await signIn(account.email, PASSWORD).expect(401);
		await signIn(account.email, NEW_PASSWORD).expect(200);
		// The owner hears of it, in case it was not them.
		await waitForLink(account.email, /\S+\/en\/settings\?tab=account/);
	});

	it("refuses a new password from a known data breach", async () => {
		const client = browser(app);
		const account = await signUpAndVerify(client);
		breaches.breached.add("leaked passphrase");

		const refused = await client
			.post("/api/auth/change-password", {
				currentPassword: PASSWORD,
				newPassword: "leaked passphrase",
			})
			.expect(400);

		expect(problemOf(refused).code).toBe("auth.password-compromised");
		await signIn(account.email, PASSWORD).expect(200);
	});

	it("refuses a wrong current password and keeps the old one", async () => {
		const client = browser(app);
		const account = await signUpAndVerify(client);

		const refused = await client
			.post("/api/auth/change-password", {
				currentPassword: "not the password",
				newPassword: NEW_PASSWORD,
			})
			.expect(400);

		expect(problemOf(refused).code).toBe("auth.invalid-password");
		await signIn(account.email, PASSWORD).expect(200);
	});

	it("holds the new password to the sign-up rules", async () => {
		const client = browser(app);
		await signUpAndVerify(client);

		const refused = await client
			.post("/api/auth/change-password", {
				currentPassword: PASSWORD,
				newPassword: "short",
			})
			.expect(400);

		expect(problemOf(refused).code).toBe("request.invalid");
	});

	it("tells an account without a password that it has none", async () => {
		const client = browser(app);
		await signUpAndVerify(client);
		const { id } = (await client.get("/api/me").expect(200)).body;
		// As an account made by a provider's sign-in.
		await database.db.delete(accounts).where(eq(accounts.userId, id));

		const refused = await client
			.post("/api/auth/change-password", {
				currentPassword: PASSWORD,
				newPassword: NEW_PASSWORD,
			})
			.expect(400);

		expect(problemOf(refused).code).toBe("auth.credential-account-not-found");
	});

	it("needs a session", async () => {
		await browser(app)
			.post("/api/auth/change-password", {
				currentPassword: PASSWORD,
				newPassword: NEW_PASSWORD,
			})
			.expect(401);
	});
});
