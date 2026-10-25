import type { IncomingMessage, ServerResponse } from "node:http";
import { API_PREFIX } from "@holdem/shared";
import type { Params } from "nestjs-pino";
import pino, { type DestinationStream } from "pino";
import pinoPretty from "pino-pretty";
import type { AppConfig } from "../config/index.js";
import { redactSecrets } from "./redact-secrets.js";
import { REQUEST_ID_HEADER, requestIdFor } from "./request-id.js";

/** Where log lines go. Tests replace this provider to read them. */
export const LOG_DESTINATION = Symbol("LogDestination");

export function logDestinationFor(config: AppConfig): DestinationStream {
	if (config.log.pretty) {
		return pinoPretty({
			colorize: true,
			singleLine: true,
			translateTime: "SYS:HH:MM:ss.l",
			ignore: "pid,hostname,context",
			messageFormat: "{if context}[{context}] {end}{msg}",
		});
	}
	// Buffered, so writing a line never blocks the event loop the tables run on. What is still in
	// the buffer when the process exits is written synchronously, so the last lines are not lost.
	const destination = pino.destination({ dest: 1, sync: false });
	process.once("exit", () => destination.flushSync());
	return destination;
}

const HEALTH_PATH = `${API_PREFIX}/health`;

const isHealthCheck = (url: string | undefined): boolean =>
	url === HEALTH_PATH || (url?.startsWith(`${HEALTH_PATH}/`) ?? false);

interface SerializedRequest {
	readonly method: string;
	readonly url: string;
	readonly remoteAddress?: string;
	/** The request itself; Express's `ip` follows `trust proxy`, unlike the socket address. */
	readonly raw: { readonly ip?: string };
}

export function loggerParams(
	config: AppConfig,
	destination: DestinationStream,
): Params {
	return {
		pinoHttp: [
			{
				level: config.log.level,
				customAttributeKeys: { reqId: "requestId" },
				// Lines written while handling a request carry just `requestId`; the closing
				// "request completed" line adds the request, response and timing.
				quietReqLogger: true,
				genReqId: (req: IncomingMessage, res: ServerResponse) => {
					const id = requestIdFor(req.headers[REQUEST_ID_HEADER]);
					res.setHeader(REQUEST_ID_HEADER, id);
					return id;
				},
				serializers: {
					// Method and path only: headers carry cookies and tokens, query strings carry
					// verification and reset tokens.
					req: (req: SerializedRequest) => ({
						method: req.method,
						path: req.url.split("?")[0],
						remoteAddress: req.raw.ip ?? req.remoteAddress,
					}),
					res: (res: { readonly statusCode: number }) => ({
						statusCode: res.statusCode,
					}),
				},

				// Load balancers poll health every few seconds; those requests would drown the rest.
				autoLogging: { ignore: (req) => isHealthCheck(req.url) },
				customLogLevel: (_req, res, error) =>
					error || res.statusCode >= 500
						? "error"
						: res.statusCode >= 400
							? "warn"
							: "info",
				formatters: {
					level: (label) => ({ level: label }),
					// Defense in depth for objects logged by hand.
					log: (object) => redactSecrets(object) as Record<string, unknown>,
				},
				timestamp: pino.stdTimeFunctions.isoTime,
			},
			destination,
		],
	};
}
