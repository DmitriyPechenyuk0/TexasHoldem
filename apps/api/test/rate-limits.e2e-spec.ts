import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import type { App } from "supertest/types.js";
import { AUTH_RATE_LIMITS } from "@/modules/identity/infrastructure/better-auth.js";
import { emailThrottleKeys } from "@/modules/identity/infrastructure/email-throttle.js";
import { SIGN_IN_RULE } from "@/modules/identity/presentation/auth.middleware.js";
import { RateLimiter } from "@/shared/application/rate-limiter.js";
import { REDIS, type Redis } from "@/shared/infrastructure/redis/index.js";
import { captureLogs } from "./support/capture-logs.js";
import { createTestApp } from "./support/create-test-app.js";
import { exampleConfig } from "./support/example-config.js";
import {
	browser,
	newAccount,
	PASSWORD,
	problemOf,
	signUpAndVerify,
	WEB_ORIGIN,
} from "./support/identity.js";
import { countEmails, waitForEmailCount } from "./support/mailpit.js";
import { TcpProxy } from "./support/tcp-proxy.js";
import {
	createTestDatabase,
	type TestDatabase,
} from "./support/test-database.js";

let lastAddress = 0;
/** A client address no other test uses, so each test starts with empty buckets. */
const nextAddress = () => `198.18.0.${++lastAddress}`;

describe("Rate limits across two api instances (e2e)", () => {
	let database: TestDatabase;
	let instances: INestApplication<App>[];
	// One Redis namespace for both, as in production.
	const rateLimitNamespace = `rate-limit-test:${randomUUID()}`;

	beforeAll(async () => {
		database = await createTestDatabase();
		instances = await Promise.all(
			[1, 2].map(() =>
				createTestApp({
					config: { database: { url: database.url }, trustProxy: "loopback" },
					rateLimitNamespace,
				}),
			),
		);
	});

	afterAll(async () => {
		await Promise.all(instances?.map((app) => app.close()) ?? []);
		await database?.drop();
	});

	/** A POST from one client address, sent to the instances in turn, as a load balancer would. */
	function roundRobin(ip: string) {
		let sent = 0;
		return (path: string, body: object) =>
			request(instances[sent++ % instances.length]!.getHttpServer())
				.post(path)
				.set("Origin", WEB_ORIGIN)
				.set("X-Forwarded-For", ip)
				.send(body);
	}

	it("allows 5 sign-ins a minute per address and identifier, then 429 with Retry-After", async () => {
		const post = roundRobin(nextAddress());
		const signIn = (username: string) =>
			post("/api/auth/sign-in/username", { username, password: "a guess" });

		const statuses: number[] = [];
		for (let attempt = 0; attempt <= SIGN_IN_RULE.max; attempt++) {
			statuses.push((await signIn("victim_one")).status);
		}
		const refused = await signIn("victim_one");

		expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
		expect(problemOf(refused).code).toBe("request.rate-limited");
		expect(Number(refused.headers["retry-after"])).toBeGreaterThan(50);
		expect(Number(refused.headers["retry-after"])).toBeLessThanOrEqual(60);
		// Another identifier from the same address has its own budget.
		await signIn("victim_two").expect(401);
	});

	it("allows 3 sign-ups a minute per address, then 429 with Retry-After", async () => {
		const ip = nextAddress();
		const post = roundRobin(ip);

		const statuses: number[] = [];
		for (let attempt = 0; attempt <= AUTH_RATE_LIMITS.signUp.max; attempt++) {
			statuses.push(
				(await post("/api/auth/sign-up/email", newAccount())).status,
			);
		}
		const refused = await post("/api/auth/sign-up/email", newAccount());

		expect(statuses).toEqual([200, 200, 200, 429]);
		expect(problemOf(refused).code).toBe("request.rate-limited");
		expect(Number(refused.headers["retry-after"])).toBeGreaterThan(0);
		// Better Auth's own memory store would be shared by two apps in one process too: check
		// that its counter lives in Redis.
		const redis = instances[0]!.get<Redis>(REDIS);
		expect(
			await redis.exists(`${rateLimitNamespace}:auth:${ip}|/sign-up/email`),
		).toBe(1);
	});

	it("sends 3 reset emails an hour to an address, however many clients and instances ask", async () => {
		const account = await signUpAndVerify(browser(instances[0]!));
		const limiter = instances[0]!.get(RateLimiter);

		for (let attempt = 0; attempt < 4; attempt++) {
			// A fresh client each time, and the minute between emails gone by.
			await roundRobin(nextAddress())("/api/auth/request-password-reset", {
				email: account.email,
				redirectTo: "/en/reset-password",
			}).expect(200);
			await limiter.reset(
				emailThrottleKeys("reset-password", account.email).minute,
			);
		}

		// The verification email, then three reset emails.
		await waitForEmailCount(account.email, 4);
		await new Promise((resolve) => setTimeout(resolve, 500));
		expect(await countEmails(account.email)).toBe(4);
	});
});

describe("Rate limits while Redis is away (e2e)", () => {
	const redis = new URL(exampleConfig().redis.url);
	const proxy = new TcpProxy({
		host: redis.hostname,
		port: Number(redis.port),
	});
	let database: TestDatabase;
	let app: INestApplication<App>;

	beforeAll(async () => {
		database = await createTestDatabase();
		await proxy.start();
		app = await createTestApp({
			config: { database: { url: database.url }, redis: { url: proxy.url } },
		});
	});

	afterAll(async () => {
		await app?.close();
		await proxy.stop();
		await database?.drop();
	});

	it("lets requests through and says so once, instead of failing every sign-in", async () => {
		const account = newAccount();
		await request(app.getHttpServer())
			.post("/api/auth/sign-up/email")
			.set("Origin", WEB_ORIGIN)
			.send(account)
			.expect(200);
		const { lines } = captureLogs();

		await proxy.stop();
		// Each attempt waits out the command timeout twice: our limit, then Better Auth's.
		const statuses: number[] = [];
		for (let attempt = 0; attempt < 2; attempt++) {
			const response = await request(app.getHttpServer())
				.post("/api/auth/sign-in/username")
				.set("Origin", WEB_ORIGIN)
				.send({ username: account.username, password: PASSWORD });
			statuses.push(response.status);
		}

		// Unverified, so refused, but by the rules rather than by the outage.
		expect(statuses).toEqual([403, 403]);
		const warnings = lines.filter((line) =>
			String(line.msg).startsWith("Rate limits are off until Redis answers"),
		);
		expect(warnings).toHaveLength(1);
	}, 20_000);
});
