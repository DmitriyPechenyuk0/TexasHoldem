import { Chips, PageQuery, Problem, TableId } from "@holdem/shared";
import {
	Controller,
	ForbiddenException,
	Get,
	type INestApplication,
	Post,
	Res,
	UnauthorizedException,
} from "@nestjs/common";
import type { Response } from "express";
import request from "supertest";
import type { App } from "supertest/types.js";
import { z } from "zod";
import {
	DomainError,
	type DomainErrorKind,
} from "@/shared/domain/domain-error.js";
import {
	ValidBody,
	ValidParam,
	ValidQuery,
} from "@/shared/presentation/request-validation.js";
import { captureLogs } from "./support/capture-logs.js";
import { createTestApp } from "./support/create-test-app.js";

const TakeSeatRequest = z.object({ seat: z.int().min(1).max(9), buyIn: Chips });
type TakeSeatRequest = z.infer<typeof TakeSeatRequest>;

class SeatTakenError extends DomainError {
	readonly code = "table.seat-taken";

	constructor(
		readonly kind: DomainErrorKind,
		seat: number,
	) {
		super(`Seat ${seat} is taken`, { params: { seat } });
	}
}

@Controller("probe")
class ProbeController {
	@Post("seats")
	takeSeat(@ValidBody(TakeSeatRequest) body: TakeSeatRequest) {
		return body;
	}

	@Get("tables")
	listTables(@ValidQuery(PageQuery) query: PageQuery) {
		return query;
	}

	@Get("tables/:tableId")
	getTable(@ValidParam("tableId", TableId) tableId: TableId) {
		return { tableId };
	}

	@Get("domain/:kind")
	failByRule(@ValidParam("kind", z.string()) kind: DomainErrorKind): never {
		throw new SeatTakenError(kind, 3);
	}

	@Get("unauthenticated")
	unauthenticated(): never {
		throw new UnauthorizedException("Sign in to take a seat");
	}

	@Get("forbidden")
	forbidden(): never {
		throw new ForbiddenException("Only the host can close the table");
	}

	@Get("stream-crash")
	streamCrash(@Res() response: Response): never {
		response.status(200).write("first chunk;");
		throw new Error("boom in the middle of a stream");
	}

	@Get("crash")
	crash(): never {
		throw new Error("boom: connection string postgres://holdem:secret@db");
	}
}

describe("Problems (e2e)", () => {
	const { lines } = captureLogs();
	let app: INestApplication<App>;

	beforeAll(async () => {
		app = await createTestApp({
			controllers: [ProbeController],
		});
	});

	afterAll(async () => {
		await app.close();
	});

	/** Every error answer is problem+json, matches the shared contract and carries the request id. */
	const problemOf = (response: request.Response): Problem => {
		expect(response.headers["content-type"]).toMatch(
			/^application\/problem\+json/,
		);
		const problem = Problem.parse(response.body);
		expect(problem.requestId).toBe(response.headers["x-request-id"]);
		return problem;
	};

	describe("validation", () => {
		it("answers an invalid body with 400 and every invalid field", async () => {
			const response = await request(app.getHttpServer())
				.post("/probe/seats")
				.send({ seat: 12, buyIn: -5 })
				.expect(400);

			expect(problemOf(response)).toMatchObject({
				status: 400,
				code: "request.invalid",
				instance: "/probe/seats",
				errors: [
					{ path: ["seat"], code: "too_big", message: expect.any(String) },
					{ path: ["buyIn"], code: "too_small", message: expect.any(String) },
				],
			});
		});

		it("answers an invalid query or route param with the offending name", async () => {
			const query = await request(app.getHttpServer())
				.get("/probe/tables?limit=ten")
				.expect(400);
			const param = await request(app.getHttpServer())
				.get("/probe/tables/not-a-uuid")
				.expect(400);

			expect(problemOf(query).errors?.map((error) => error.path)).toEqual([
				["limit"],
			]);
			expect(problemOf(param).errors?.map((error) => error.path)).toEqual([
				["tableId"],
			]);
		});

		it("hands handlers the parsed values", async () => {
			await request(app.getHttpServer())
				.post("/probe/seats")
				.send({ seat: 3, buyIn: 1000, extra: "dropped" })
				.expect(201, { seat: 3, buyIn: 1000 });
			await request(app.getHttpServer())
				.get("/probe/tables?limit=50")
				.expect(200, { limit: 50 });
		});
	});

	describe("domain errors", () => {
		it.each<[DomainErrorKind, number]>([
			["not-found", 404],
			["conflict", 409],
			["rule-violation", 422],
			["forbidden", 403],
		])(
			"answer a %s error with %i, its code as message key and its params",
			async (kind, status) => {
				const response = await request(app.getHttpServer())
					.get(`/probe/domain/${kind}`)
					.expect(status);

				expect(problemOf(response)).toMatchObject({
					status,
					code: "table.seat-taken",
					params: { seat: 3 },
					detail: "Seat 3 is taken",
				});
			},
		);
	});

	describe("HTTP errors", () => {
		it.each([
			[
				"/probe/unauthenticated",
				401,
				"auth.unauthenticated",
				"Sign in to take a seat",
			],
			[
				"/probe/forbidden",
				403,
				"auth.forbidden",
				"Only the host can close the table",
			],
			["/nowhere", 404, "http.not-found", "Cannot GET /nowhere"],
		])("answer %s with %i %s", async (path, status, code, detail) => {
			const response = await request(app.getHttpServer())
				.get(path)
				.expect(status);

			expect(problemOf(response)).toMatchObject({ status, code, detail });
		});

		it("answer a malformed JSON body with 400", async () => {
			const response = await request(app.getHttpServer())
				.post("/probe/seats")
				.set("content-type", "application/json")
				.send('{"seat":')
				.expect(400);

			expect(problemOf(response)).toMatchObject({ code: "request.bad" });
		});

		it("answer an oversized body with 413", async () => {
			const response = await request(app.getHttpServer())
				.post("/probe/seats")
				.send({ seat: 1, buyIn: 1, note: "x".repeat(200_000) })
				.expect(413);

			expect(problemOf(response)).toMatchObject({ code: "request.too-large" });
		});
	});

	describe("unexpected errors", () => {
		it("answer with a bare 500 and log the error with its stack and request id", async () => {
			lines.length = 0;
			const response = await request(app.getHttpServer())
				.get("/probe/crash")
				.expect(500);

			const problem = problemOf(response);
			expect(problem).toEqual({
				type: "about:blank",
				title: "Internal Server Error",
				status: 500,
				code: "internal",
				instance: "/probe/crash",
				requestId: problem.requestId,
			});
			expect(response.text).not.toMatch(/boom|secret|postgres/);

			expect(lines).toContainEqual(
				expect.objectContaining({
					level: "error",
					context: "ProblemFilter",
					requestId: problem.requestId,
					err: expect.objectContaining({
						message: expect.stringContaining("boom"),
						stack: expect.stringContaining("ProbeController.crash"),
					}),
				}),
			);
		});

		it("end a response that had already started, instead of failing in the filter", async () => {
			lines.length = 0;
			const response = await request(app.getHttpServer())
				.get("/probe/stream-crash")
				.expect(200);

			expect(response.text).toBe("first chunk;");
			expect(lines).toContainEqual(
				expect.objectContaining({
					level: "error",
					context: "ProblemFilter",
					err: expect.objectContaining({
						message: "boom in the middle of a stream",
					}),
				}),
			);
		});

		it("do not log expected failures as errors", async () => {
			lines.length = 0;
			await request(app.getHttpServer()).get("/probe/domain/conflict");
			await request(app.getHttpServer()).post("/probe/seats").send({});

			expect(lines.filter((line) => line.context === "ProblemFilter")).toEqual(
				[],
			);
		});
	});
});
