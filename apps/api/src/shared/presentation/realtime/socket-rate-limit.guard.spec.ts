import type { ExecutionContext } from "@nestjs/common";
import {
	SOCKET_COMMANDS_PER_SECOND,
	SocketRateLimit,
} from "./socket-rate-limit.guard.js";

const contextFor = (socket: object) =>
	({
		switchToWs: () => ({ getClient: () => socket }),
	}) as unknown as ExecutionContext;

describe("SocketRateLimit", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("lets a socket send its commands for each second, then refuses more until the next", () => {
		vi.useFakeTimers();
		const guard = new SocketRateLimit();
		const flooding = contextFor({});
		const other = contextFor({});

		for (let i = 0; i < SOCKET_COMMANDS_PER_SECOND; i++) {
			expect(guard.canActivate(flooding)).toBe(true);
		}
		expect(() => guard.canActivate(flooding)).toThrow(
			expect.objectContaining({ code: "request.rate-limited" }),
		);
		expect(guard.canActivate(other)).toBe(true);

		vi.advanceTimersByTime(1_000);
		expect(guard.canActivate(flooding)).toBe(true);
	});
});
