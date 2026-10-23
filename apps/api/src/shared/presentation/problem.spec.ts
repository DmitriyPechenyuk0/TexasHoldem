import {
	BadRequestException,
	ForbiddenException,
	NotFoundException,
	PayloadTooLargeException,
	ServiceUnavailableException,
	UnauthorizedException,
} from "@nestjs/common";
import { DomainError, type DomainErrorKind } from "../domain/domain-error.js";
import { ackFailure } from "./ack.js";
import { problemFor } from "./problem.js";
import { RequestValidationError } from "./request-validation.js";

class ProbeError extends DomainError {
	readonly code = "table.seat-taken";

	constructor(readonly kind: DomainErrorKind) {
		super("Seat 3 is taken", { params: { seat: 3 } });
	}
}

const context = { instance: "/tables/t1/seats", requestId: "edge-7f3a" };

describe("problemFor", () => {
	it("answers a request validation error with 400 and every invalid field", () => {
		const issues = [{ path: ["seat"], code: "too_big", message: "Too big" }];

		expect(problemFor(new RequestValidationError(issues), context)).toEqual({
			problem: {
				type: "about:blank",
				title: "Bad Request",
				status: 400,
				code: "request.invalid",
				detail: "The request is invalid.",
				errors: issues,
				instance: "/tables/t1/seats",
				requestId: "edge-7f3a",
			},
			unexpected: false,
		});
	});

	it.each<[DomainErrorKind, number, string]>([
		["not-found", 404, "Not Found"],
		["conflict", 409, "Conflict"],
		["rule-violation", 422, "Unprocessable Entity"],
		["forbidden", 403, "Forbidden"],
	])(
		"answers a %s domain error with %i, its code and its params",
		(kind, status, title) => {
			expect(problemFor(new ProbeError(kind)).problem).toEqual({
				type: "about:blank",
				title,
				status,
				code: "table.seat-taken",
				detail: "Seat 3 is taken",
				params: { seat: 3 },
			});
		},
	);

	it.each([
		[new UnauthorizedException(), 401, "auth.unauthenticated"],
		[new ForbiddenException(), 403, "auth.forbidden"],
		[new NotFoundException("Cannot GET /nope"), 404, "http.not-found"],
		[
			new BadRequestException("Unexpected end of JSON input"),
			400,
			"request.bad",
		],
		[new PayloadTooLargeException(), 413, "request.too-large"],
	])("maps %o to %i %s", (error, status, code) => {
		const { problem, unexpected } = problemFor(error);

		expect(problem).toMatchObject({ status, code, detail: error.message });
		expect(unexpected).toBe(false);
	});

	it("maps http-errors style errors from Express middleware by their status", () => {
		const tooLarge = Object.assign(new Error("request entity too large"), {
			status: 413,
			expose: true,
		});

		expect(problemFor(tooLarge)).toEqual({
			problem: expect.objectContaining({
				status: 413,
				code: "request.too-large",
				detail: "request entity too large",
			}),
			unexpected: false,
		});
	});

	it("treats a status on an error that does not opt in with expose as a bug", () => {
		const leaky = Object.assign(new Error("db password rejected"), {
			status: 401,
		});

		expect(problemFor(leaky)).toMatchObject({
			problem: { status: 500, code: "internal" },
			unexpected: true,
		});
	});

	it("keeps the message of a deliberate server error out of the body", () => {
		const { problem } = problemFor(
			new ServiceUnavailableException("pool exhausted at db-2:5432"),
		);

		expect(problem).toEqual({
			type: "about:blank",
			title: "Service Unavailable",
			status: 503,
			code: "internal",
		});
	});

	it.each([
		[
			"an Error",
			new TypeError("cannot read properties of undefined (password)"),
		],
		["a thrown string", "boom"],
	])(
		"answers %s with a bare 500 and flags it as unexpected",
		(_case, error) => {
			expect(problemFor(error, context)).toEqual({
				problem: {
					type: "about:blank",
					title: "Internal Server Error",
					status: 500,
					code: "internal",
					instance: "/tables/t1/seats",
					requestId: "edge-7f3a",
				},
				unexpected: true,
			});
		},
	);
});

describe("ackFailure", () => {
	it("wraps the same problem for a socket reply", () => {
		expect(ackFailure(new ProbeError("conflict"))).toEqual({
			ok: false,
			error: expect.objectContaining({ status: 409, code: "table.seat-taken" }),
		});
	});
});
