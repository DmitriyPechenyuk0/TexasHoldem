import { STATUS_CODES } from "node:http";
import type { Problem } from "@holdem/shared";
import { HttpException } from "@nestjs/common";
import { DomainError, type DomainErrorKind } from "../domain/domain-error.js";
import { RequestValidationError } from "./request-validation.js";

const STATUS_BY_KIND: Readonly<Record<DomainErrorKind, number>> = {
	"not-found": 404,
	conflict: 409,
	"rule-violation": 422,
	forbidden: 403,
};

// Codes for errors Nest or its middleware raise as HttpException: auth guards, unknown routes, body parsing.
const CODE_BY_STATUS: Readonly<Record<number, string>> = {
	400: "request.bad",
	401: "auth.unauthenticated",
	403: "auth.forbidden",
	404: "http.not-found",
	405: "http.method-not-allowed",
	413: "request.too-large",
	415: "request.unsupported-media-type",
	429: "request.rate-limited",
};

export interface ProblemContext {
	/** Path of the request, without its query string. */
	readonly instance?: string;
	readonly requestId?: string;
}

export interface ResolvedProblem {
	readonly problem: Problem;
	/** Not a rule, a request or an HTTP error: a bug, to be logged with its stack. */
	readonly unexpected: boolean;
}

/**
 * The status of an HTTP error: a Nest `HttpException`, or an `http-errors` style error raised by
 * Express middleware such as the body parser (`{ status: 413, expose: true }`).
 */
function httpStatusOf(error: unknown): number | undefined {
	if (error instanceof HttpException) {
		return error.getStatus();
	}
	if (
		error instanceof Error &&
		"status" in error &&
		typeof error.status === "number" &&
		error.status >= 400 &&
		error.status < 600 &&
		"expose" in error &&
		error.expose === true
	) {
		return error.status;
	}
	return undefined;
}

/** The one mapping from anything thrown to the error body of HTTP responses and socket acks. */
export function problemFor(
	error: unknown,
	context: ProblemContext = {},
): ResolvedProblem {
	const problem = (
		status: number,
		code: string,
		extra: Partial<Problem> = {},
	): Problem => ({
		type: "about:blank",
		title: STATUS_CODES[status] ?? "Error",
		status,
		code,
		...extra,
		...(context.instance ? { instance: context.instance } : {}),
		...(context.requestId ? { requestId: context.requestId } : {}),
	});

	if (error instanceof RequestValidationError) {
		return {
			problem: problem(400, "request.invalid", {
				detail: error.message,
				errors: [...error.issues],
			}),
			unexpected: false,
		};
	}
	if (error instanceof DomainError) {
		return {
			problem: problem(STATUS_BY_KIND[error.kind], error.code, {
				detail: error.message,
				...(error.params ? { params: error.params } : {}),
			}),
			unexpected: false,
		};
	}
	const status = httpStatusOf(error);
	if (status !== undefined) {
		return {
			problem: problem(
				status,
				CODE_BY_STATUS[status] ??
					(status >= 500 ? "internal" : `http.${status}`),
				// Messages of client errors are meant for the client; server errors stay generic.
				status < 500 ? { detail: (error as Error).message } : {},
			),
			unexpected: false,
		};
	}
	return { problem: problem(500, "internal"), unexpected: true };
}
