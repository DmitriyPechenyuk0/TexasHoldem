import { STATUS_CODES } from "node:http";
import { PROBLEM_CONTENT_TYPE } from "@holdem/shared";
import {
	SendVerificationEmailRequest,
	SignInEmailRequest,
	SignInUsernameRequest,
	SignUpRequest,
} from "@holdem/shared/contracts/identity";
import { HttpException, Injectable, type NestMiddleware } from "@nestjs/common";
import { toNodeHandler } from "better-auth/node";
import type {
	Request as ExpressRequest,
	Response as ExpressResponse,
} from "express";
import type { z } from "zod";
import {
	HttpProblem,
	type ProblemContext,
	problemFor,
} from "@/shared/presentation/problem.js";
import { ZodValidationPipe } from "@/shared/presentation/request-validation.js";
import {
	AUTH_BASE_PATH,
	AuthHttpHandler,
	CLIENT_IP_HEADER,
} from "../application/auth-http-handler.js";

/** Bodies we validate and strip before Better Auth sees them; it would accept extra user fields. */
const BODY_CONTRACTS: Readonly<Record<string, z.ZodType>> = {
	[`${AUTH_BASE_PATH}/sign-up/email`]: SignUpRequest,
	[`${AUTH_BASE_PATH}/sign-in/email`]: SignInEmailRequest,
	[`${AUTH_BASE_PATH}/sign-in/username`]: SignInUsernameRequest,
	[`${AUTH_BASE_PATH}/send-verification-email`]: SendVerificationEmailRequest,
};

const hasBody = (request: ExpressRequest): boolean =>
	Number(request.headers["content-length"] ?? 0) > 0 ||
	request.headers["transfer-encoding"] !== undefined;

/**
 * Turns Better Auth's error answers (`{ code: "USERNAME_IS_ALREADY_TAKEN", message }`) into the
 * api's problem details, with the code as `auth.username-is-already-taken`. Headers such as
 * `Set-Cookie` and `X-Retry-After` are kept.
 */
export async function asProblem(
	response: Response,
	context: ProblemContext,
): Promise<Response> {
	if (response.status < 400) {
		return response;
	}
	const body = (await response
		.clone()
		.json()
		.catch(() => undefined)) as
		{ readonly code?: unknown; readonly message?: unknown } | undefined;
	const message =
		typeof body?.message === "string"
			? body.message
			: (STATUS_CODES[response.status] ?? "Error");
	// A server error stays `internal`, whatever Better Auth calls it.
	const error =
		typeof body?.code === "string" && response.status < 500
			? new HttpProblem(
					response.status,
					`auth.${body.code.toLowerCase().replaceAll("_", "-")}`,
					message,
				)
			: new HttpException(message, response.status);

	const headers = new Headers(response.headers);
	headers.set("content-type", PROBLEM_CONTENT_TYPE);
	headers.delete("content-length");
	return new Response(JSON.stringify(problemFor(error, context).problem), {
		status: response.status,
		headers,
	});
}

/**
 * Serves Better Auth's endpoints under `/api/auth`. It runs after the request logger and the
 * same-origin check, and adds what Better Auth lacks: JSON only (it would also parse HTML form
 * posts), contracts for the bodies we accept, a client address that honours TRUST_PROXY, and
 * problem details for errors. Bodies are capped at 16 KiB by the app's JSON parser.
 */
@Injectable()
export class AuthMiddleware implements NestMiddleware {
	constructor(private readonly handler: AuthHttpHandler) {}

	async use(
		request: ExpressRequest & { id?: unknown },
		response: ExpressResponse,
	): Promise<void> {
		if (hasBody(request) && !request.is("application/json")) {
			throw new HttpProblem(
				415,
				"request.unsupported-media-type",
				"Send the body as JSON.",
			);
		}

		// Nest mounts middleware on a path, which Express strips from `url`; Better Auth routes on the full one.
		request.url = request.originalUrl;
		const { path } = request;
		const contract =
			request.method === "POST" ? BODY_CONTRACTS[path] : undefined;
		if (contract) {
			request.body = new ZodValidationPipe(contract).transform(
				request.body ?? {},
			);
		}

		if (request.ip) {
			request.headers[CLIENT_IP_HEADER] = request.ip;
		} else {
			delete request.headers[CLIENT_IP_HEADER];
		}

		const context: ProblemContext = {
			instance: path,
			requestId: typeof request.id === "string" ? request.id : undefined,
		};
		await toNodeHandler(async (fetchRequest) =>
			asProblem(await this.handler.handle(fetchRequest), context),
		)(request, response);
	}
}
