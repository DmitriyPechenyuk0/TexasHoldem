import { ServerTimeResponse } from "@holdem/shared/contracts/system";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import type { App } from "supertest/types.js";
import { createTestApp } from "./support/create-test-app.js";

describe("System (e2e)", () => {
	let app: INestApplication<App>;

	beforeAll(async () => {
		app = await createTestApp();
	});

	afterAll(async () => {
		await app.close();
	});

	it("GET /api/system/time returns the current server time, as the contract describes", async () => {
		const before = Date.now();
		const response = await request(app.getHttpServer())
			.get("/api/system/time")
			.expect(200);
		const after = Date.now();

		const { now } = ServerTimeResponse.parse(response.body);
		expect(Date.parse(now)).toBeGreaterThanOrEqual(before);
		expect(Date.parse(now)).toBeLessThanOrEqual(after);
	});

	it("answers with security headers and without naming the framework", async () => {
		const response = await request(app.getHttpServer())
			.get("/api/system/time")
			.expect(200);

		expect(response.headers).toMatchObject({
			"x-content-type-options": "nosniff",
			"x-frame-options": "SAMEORIGIN",
			"cross-origin-resource-policy": "same-site",
			"content-security-policy": expect.stringContaining("default-src 'self'"),
			"strict-transport-security": expect.stringContaining("max-age="),
		});
		expect(response.headers).not.toHaveProperty("x-powered-by");
	});
});
