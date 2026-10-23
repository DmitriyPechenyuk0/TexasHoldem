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

	it("GET /system/time returns the current server time", async () => {
		const before = Date.now();
		const response = await request(app.getHttpServer())
			.get("/system/time")
			.expect(200);
		const after = Date.now();

		const now: unknown = response.body.now;
		expect(now).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
		expect(Date.parse(now as string)).toBeGreaterThanOrEqual(before);
		expect(Date.parse(now as string)).toBeLessThanOrEqual(after);
	});
});
