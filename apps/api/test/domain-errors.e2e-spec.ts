import { Controller, Get, type INestApplication, Param } from "@nestjs/common";
import request from "supertest";
import type { App } from "supertest/types.js";
import {
	DomainError,
	type DomainErrorKind,
} from "@/shared/domain/domain-error.js";
import { createTestApp } from "./support/create-test-app.js";

class ProbeError extends DomainError {
	readonly code = "probe.failed";

	constructor(readonly kind: DomainErrorKind) {
		super(`Probe failed as ${kind}`);
	}
}

@Controller("probe")
class ProbeController {
	@Get("domain-error/:kind")
	fail(@Param("kind") kind: DomainErrorKind): never {
		throw new ProbeError(kind);
	}

	@Get("unexpected-error")
	crash(): never {
		throw new Error("boom");
	}
}

describe("Domain error mapping (e2e)", () => {
	let app: INestApplication<App>;

	beforeAll(async () => {
		app = await createTestApp({ controllers: [ProbeController] });
	});

	afterAll(async () => {
		await app.close();
	});

	it.each<[DomainErrorKind, number]>([
		["not-found", 404],
		["conflict", 409],
		["rule-violation", 422],
		["forbidden", 403],
	])("maps %s to HTTP %i", async (kind, status) => {
		const response = await request(app.getHttpServer())
			.get(`/probe/domain-error/${kind}`)
			.expect(status);

		expect(response.body).toEqual({
			statusCode: status,
			code: "probe.failed",
			message: `Probe failed as ${kind}`,
		});
	});

	it("leaves other errors to Nest, which hides their details", async () => {
		const response = await request(app.getHttpServer())
			.get("/probe/unexpected-error")
			.expect(500);

		expect(JSON.stringify(response.body)).not.toContain("boom");
	});
});
