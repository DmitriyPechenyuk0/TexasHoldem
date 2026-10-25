import {
	NAMESPACES,
	type SessionExpiredEvent,
	type SocketData,
} from "@holdem/shared/realtime";
import {
	type CanActivate,
	type ExecutionContext,
	Injectable,
	Logger,
	UnauthorizedException,
} from "@nestjs/common";
import type { DefaultEventsMap, Socket } from "socket.io";
import type { z } from "zod";
import { ViewerResolver } from "../../application/viewer.js";
import { HttpProblem, problemFor } from "../problem.js";

/** A server-side socket: the events every namespace may emit, and the viewer in `data`. */
export type ViewerSocket = Socket<
	DefaultEventsMap,
	{
		"session-expired": (
			payload: z.infer<(typeof SessionExpiredEvent)["payload"]>,
		) => void;
	},
	DefaultEventsMap,
	SocketData
>;

/** Namespaces a client may join without a session. Every other one needs a signed-in viewer. */
export const PUBLIC_NAMESPACES: ReadonlySet<string> = new Set([
	NAMESPACES.system,
]);

/**
 * How often an idle socket's session is checked again. A socket that sends no command still
 * receives what its viewer may see, so a signed-out or revoked session must not keep it for long.
 */
export const SESSION_RECHECK_MS = 60_000;

// Only the cookie: the session is all that matters, and the handshake's other headers are the client's.
const sessionHeadersOf = (socket: ViewerSocket) => ({
	cookie: socket.request.headers.cookie,
});

/** socket.io hands `message` and `data` of a middleware's error to the client's `connect_error`. */
function connectionError(error: unknown): Error {
	const { problem } = problemFor(error);
	return Object.assign(new Error(problem.code), { data: problem });
}

/**
 * Re-reads the socket's session and refreshes its viewer (the email may have been verified since).
 * When the session is gone, sends `session-expired` and disconnects. Returns whether it is valid.
 */
export async function ensureSession(
	socket: ViewerSocket,
	viewers: ViewerResolver,
): Promise<boolean> {
	const known = socket.data.viewer;
	if (!known) {
		return true;
	}
	const viewer = await viewers.resolve(sessionHeadersOf(socket));
	if (viewer?.userId !== known.userId) {
		socket.emit("session-expired", {});
		// The event is flushed before the connection closes.
		socket.disconnect(true);
		return false;
	}
	socket.data.viewer = viewer;
	return true;
}

/**
 * Resolves the viewer from the handshake's session cookie when a client joins a namespace. Without
 * a session (no cookie, or an expired or forged one) the viewer is null, and only public namespaces
 * let it in; the client gets `connect_error` with a 401 problem. A failed lookup refuses the
 * connection with a 500 problem.
 */
export function authenticateSockets(
	viewers: ViewerResolver,
	recheckMs = SESSION_RECHECK_MS,
) {
	const logger = new Logger("SocketSession");

	return (socket: ViewerSocket, next: (error?: Error) => void): void => {
		viewers.resolve(sessionHeadersOf(socket)).then(
			(viewer) => {
				socket.data.viewer = viewer;
				if (!viewer) {
					next(
						PUBLIC_NAMESPACES.has(socket.nsp.name)
							? undefined
							: connectionError(
									new UnauthorizedException("Sign in to connect."),
								),
					);
					return;
				}
				const timer = setInterval(() => {
					// A failed lookup keeps the socket; the next check tries again.
					ensureSession(socket, viewers).catch(() => undefined);
				}, recheckMs);
				timer.unref();
				socket.on("disconnect", () => clearInterval(timer));
				next();
			},
			(error: unknown) => {
				logger.error(error);
				next(connectionError(error));
			},
		);
	};
}

/**
 * Checks the session again before every command, so a signed-out, expired or revoked one cannot
 * act: the socket gets `session-expired` and is disconnected. `@RealtimeGateway` applies it.
 */
@Injectable()
export class SocketSessionGuard implements CanActivate {
	constructor(private readonly viewers: ViewerResolver) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const socket = context.switchToWs().getClient<ViewerSocket>();
		if (!(await ensureSession(socket, this.viewers))) {
			throw new HttpProblem(
				401,
				"auth.session-expired",
				"The session is over. Sign in again.",
			);
		}
		return true;
	}
}
