import { isDeepStrictEqual } from "node:util";
import {
	LivenessResponse,
	ReadinessResponse,
} from "@holdem/shared/contracts/system";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import type { App } from "supertest/types.js";
import {
	REDIS,
	REDIS_COMMAND_TIMEOUT_MS,
	type Redis,
} from "@/shared/infrastructure/redis/index.js";
import { captureLogs } from "./support/capture-logs.js";
import { createTestApp } from "./support/create-test-app.js";
import { exampleConfig } from "./support/example-config.js";
import { TcpProxy } from "./support/tcp-proxy.js";

interface ExpectedReadiness {
	readonly status: number;
	readonly checks: Readonly<Record<string, "up" | "down">>;
}

/**
 * Polls readiness until it reports `expected`, both the status and every check: the Redis client
 * connects, notices outages and recovers asynchronously, so an early 503 may still have Redis down.
 */
async function waitForReadiness(
	app: INestApplication<App>,
	expected: ExpectedReadiness,
): Promise<request.Response> {
	const deadline = Date.now() + 10_000;
	for (;;) {
		const response = await request(app.getHttpServer()).get("/health/ready");
		const matches =
			response.status === expected.status &&
			isDeepStrictEqual(response.body.checks, expected.checks);
		if (matches || Date.now() > deadline) {
			return response;
		}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
}

const ALL_UP = {
	status: 200,
	checks: { database: "up", redis: "up" },
} as const;

describe("Health (e2e)", () => {
	describe("with every dependency up", () => {
		let app: INestApplication<App>;

		beforeAll(async () => {
			app = await createTestApp();
		});

		afterAll(async () => {
			await app.close();
		});

		it("GET /health reports the process as alive", async () => {
			const response = await request(app.getHttpServer())
				.get("/health")
				.expect(200);

			expect(LivenessResponse.parse(response.body)).toEqual({ status: "ok" });
		});

		it("GET /health/ready reports every dependency as up", async () => {
			const response = await waitForReadiness(app, ALL_UP);

			expect(response.status).toBe(200);
			expect(ReadinessResponse.parse(response.body)).toEqual({
				status: "ready",
				checks: { database: "up", redis: "up" },
			});
		});
	});

	describe("when Redis goes away and comes back", () => {
		const redis = new URL(exampleConfig().redis.url);
		const proxy = new TcpProxy({
			host: redis.hostname,
			port: Number(redis.port),
		});
		let app: INestApplication<App>;

		beforeAll(async () => {
			await proxy.start();
			app = await createTestApp({ config: { redis: { url: proxy.url } } });
		});

		afterAll(async () => {
			await app.close();
			await proxy.stop();
		});

		it("reports 503 while Redis is down and 200 once it is back", async () => {
			const { lines } = captureLogs();
			expect((await waitForReadiness(app, ALL_UP)).status).toBe(200);

			await proxy.stop();
			const down = await waitForReadiness(app, {
				status: 503,
				checks: { database: "up", redis: "down" },
			});
			expect(down.status).toBe(503);
			expect(ReadinessResponse.parse(down.body)).toEqual({
				status: "not-ready",
				checks: { database: "up", redis: "down" },
			});
			await request(app.getHttpServer()).get("/health").expect(200);

			// A command does not hang while Redis is away: it fails after the command timeout.
			const startedAt = performance.now();
			await expect(app.get<Redis>(REDIS).get("any-key")).rejects.toThrow();
			const waitedMs = performance.now() - startedAt;
			expect(waitedMs).toBeGreaterThanOrEqual(REDIS_COMMAND_TIMEOUT_MS - 50);
			expect(waitedMs).toBeLessThan(REDIS_COMMAND_TIMEOUT_MS + 1_000);

			await proxy.start();
			const back = await waitForReadiness(app, ALL_UP);
			expect(back.status).toBe(200);
			expect(back.body.checks).toEqual({ database: "up", redis: "up" });

			// One warning per outage and one line on recovery, attributed to no request.
			const redisLines = lines.filter((line) => line.context === "Redis");
			expect(redisLines.map((line) => line.level)).toEqual(["warn", "info"]);
			for (const line of redisLines) {
				expect(line).not.toHaveProperty("requestId");
			}
		});
	});

	describe("with the database unreachable", () => {
		// Redis goes through a slow proxy, so readiness is first asked before the client is ready,
		// as on a busy CI runner: the test must wait for Redis instead of reading the first 503.
		const redis = new URL(exampleConfig().redis.url);
		const slowRedis = new TcpProxy(
			{ host: redis.hostname, port: Number(redis.port) },
			{ connectDelayMs: 300 },
		);
		let app: INestApplication<App>;

		beforeAll(async () => {
			await slowRedis.start();
			const database = new URL(exampleConfig().database.url);
			database.port = "1";
			app = await createTestApp({
				config: {
					database: { url: database.toString() },
					redis: { url: slowRedis.url },
				},
			});
		});

		afterAll(async () => {
			await app.close();
			await slowRedis.stop();
		});

		it("reports 503 with the database down", async () => {
			const response = await waitForReadiness(app, {
				status: 503,
				checks: { database: "down", redis: "up" },
			});

			expect(response.status).toBe(503);
			expect(response.body.checks).toEqual({
				database: "down",
				redis: "up",
			});
		});
	});
});
