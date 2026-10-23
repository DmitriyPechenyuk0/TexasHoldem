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

	it("GET /system/time returns the current server time, as the contract describes", async () => {
		const before = Date.now();
		const response = await request(app.getHttpServer())
			.get("/system/time")
			.expect(200);
		const after = Date.now();

		const { now } = ServerTimeResponse.parse(response.body);
		expect(Date.parse(now)).toBeGreaterThanOrEqual(before);
		expect(Date.parse(now)).toBeLessThanOrEqual(after);
	});
});
