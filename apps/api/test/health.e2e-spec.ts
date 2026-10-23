import {
	LivenessResponse,
	ReadinessResponse,
} from "@holdem/shared/contracts/system";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import type { App } from "supertest/types.js";
import { createTestApp } from "./support/create-test-app.js";
import { exampleConfig } from "./support/example-config.js";
import { TcpProxy } from "./support/tcp-proxy.js";

/** Polls readiness until it reports `status`; the Redis client notices outages and recoveries asynchronously. */
async function waitForReadiness(
	app: INestApplication<App>,
	status: number,
): Promise<request.Response> {
	const deadline = Date.now() + 10_000;
	for (;;) {
		const response = await request(app.getHttpServer()).get("/health/ready");
		if (response.status === status || Date.now() > deadline) {
			return response;
		}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
}

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
			const response = await waitForReadiness(app, 200);

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
			expect((await waitForReadiness(app, 200)).status).toBe(200);

			await proxy.stop();
			const down = await waitForReadiness(app, 503);
			expect(down.status).toBe(503);
			expect(ReadinessResponse.parse(down.body)).toEqual({
				status: "not-ready",
				checks: { database: "up", redis: "down" },
			});
			await request(app.getHttpServer()).get("/health").expect(200);

			await proxy.start();
			const back = await waitForReadiness(app, 200);
			expect(back.status).toBe(200);
			expect(back.body.checks).toEqual({ database: "up", redis: "up" });
		});
	});

	describe("with the database unreachable", () => {
		let app: INestApplication<App>;

		beforeAll(async () => {
			const database = new URL(exampleConfig().database.url);
			database.port = "1";
			app = await createTestApp({
				config: { database: { url: database.toString() } },
			});
		});

		afterAll(async () => {
			await app.close();
		});

		it("reports 503 with the database down", async () => {
			const response = await waitForReadiness(app, 503);

			expect(response.status).toBe(503);
			expect(response.body.checks).toEqual({
				database: "down",
				redis: "up",
			});
		});
	});
});
