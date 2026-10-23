import type { IncomingMessage, ServerResponse } from "node:http";
import type { Params } from "nestjs-pino";
import pino, { type DestinationStream } from "pino";
import pinoPretty from "pino-pretty";
import type { AppConfig } from "../config/index.js";
import { REQUEST_ID_HEADER, requestIdFor } from "./request-id.js";

/** Where log lines go. Tests replace this provider to read them. */
export const LOG_DESTINATION = Symbol("LogDestination");

export const logDestinationFor = (config: AppConfig): DestinationStream =>
	config.log.pretty
		? pinoPretty({
				colorize: true,
				singleLine: true,
				translateTime: "SYS:HH:MM:ss.l",
				ignore: "pid,hostname,context",
				messageFormat: "{if context}[{context}] {end}{msg}",
			})
		: // Synchronous, so lines written right before an exit are not lost.
			pino.destination({ dest: 1, sync: true });

// Defense in depth for objects logged by hand. Requests themselves never log headers or query strings.
const SECRET_KEYS = [
	"password",
	"newPassword",
	"currentPassword",
	"token",
	"accessToken",
	"refreshToken",
	"idToken",
	"sessionToken",
	"secret",
	"clientSecret",
	"authorization",
	"cookie",
];
const REDACTED_PATHS = SECRET_KEYS.flatMap((key) => [
	key,
	`*.${key}`,
	`*.*.${key}`,
]);

const isHealthCheck = (url: string | undefined): boolean =>
	url === "/health" || (url?.startsWith("/health/") ?? false);

interface SerializedRequest {
	readonly method: string;
	readonly url: string;
	readonly remoteAddress?: string;
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
						remoteAddress: req.remoteAddress,
					}),
					res: (res: { readonly statusCode: number }) => ({
						statusCode: res.statusCode,
					}),
				},
				redact: { paths: REDACTED_PATHS, censor: "[redacted]" },
				// Load balancers poll health every few seconds; those requests would drown the rest.
				autoLogging: { ignore: (req) => isHealthCheck(req.url) },
				customLogLevel: (_req, res, error) =>
					error || res.statusCode >= 500
						? "error"
						: res.statusCode >= 400
							? "warn"
							: "info",
				formatters: { level: (label) => ({ level: label }) },
				timestamp: pino.stdTimeFunctions.isoTime,
			},
			destination,
		],
	};
}
