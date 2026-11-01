import {
	type CanActivate,
	type ExecutionContext,
	Injectable,
} from "@nestjs/common";
import type { Socket } from "socket.io";
import { HttpProblem } from "../problem.js";

/** Commands one socket may send per second; a person clicking never comes near it. */
export const SOCKET_COMMANDS_PER_SECOND = 10;

interface Window {
	startedAt: number;
	count: number;
}

/**
 * Refuses a socket's commands past `SOCKET_COMMANDS_PER_SECOND` with 429 `request.rate-limited`,
 * before they are even validated, so one client cannot flood a table. Counted in this process:
 * a socket lives on one instance. `@UseGuards(SocketRateLimit)` on a gateway.
 */
@Injectable()
export class SocketRateLimit implements CanActivate {
	private readonly windows = new WeakMap<Socket, Window>();

	canActivate(context: ExecutionContext): boolean {
		const socket = context.switchToWs().getClient<Socket>();
		const now = Date.now();
		let window = this.windows.get(socket);
		if (!window || now - window.startedAt >= 1_000) {
			window = { startedAt: now, count: 0 };
			this.windows.set(socket, window);
		}
		window.count += 1;
		if (window.count > SOCKET_COMMANDS_PER_SECOND) {
			throw new HttpProblem(
				429,
				"request.rate-limited",
				"Too many commands. Slow down.",
			);
		}
		return true;
	}
}
