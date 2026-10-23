import type { Clock } from "@/shared/application/clock.js";
import { GetServerTimeHandler } from "./get-server-time.handler.js";

describe("GetServerTimeHandler", () => {
	it("returns the time reported by the clock", async () => {
		const now = new Date("2026-10-23T12:00:00.000Z");
		const clock: Clock = { now: () => now };

		await expect(new GetServerTimeHandler(clock).execute()).resolves.toEqual({
			now,
		});
	});
});
