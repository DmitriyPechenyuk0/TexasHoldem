import type { IncomingMessage } from "node:http";
import { PROBLEM_CONTENT_TYPE } from "@holdem/shared";
import {
	type ArgumentsHost,
	Catch,
	type ExceptionFilter,
	Logger,
} from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import { problemFor } from "./problem.js";

/**
 * Answers every failed HTTP request with a problem+json body. It replaces Nest's default
 * handler, so it also logs unexpected errors with their stack. Global filters do not reach
 * WebSocket gateways, whose `@RealtimeGateway` decorator adds `AckExceptionFilter` instead.
 */
@Catch()
export class ProblemFilter implements ExceptionFilter {
	private readonly logger = new Logger(ProblemFilter.name);

	constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

	catch(error: unknown, host: ArgumentsHost): void {
		const { httpAdapter } = this.httpAdapterHost;
		const http = host.switchToHttp();
		const request = http.getRequest<IncomingMessage & { id?: unknown }>();
		const response = http.getResponse<unknown>();

		const { problem, unexpected } = problemFor(error, {
			instance: String(httpAdapter.getRequestUrl(request)).split("?")[0],
			requestId: typeof request.id === "string" ? request.id : undefined,
		});
		if (unexpected) {
			this.logger.error(error);
		}
		// A failure in the middle of a response: the status is gone, so only end it, as Nest does.
		if (httpAdapter.isHeadersSent(response)) {
			httpAdapter.end(response);
			return;
		}

		httpAdapter.setHeader(response, "content-type", PROBLEM_CONTENT_TYPE);
		httpAdapter.reply(response, problem, problem.status);
	}
}
