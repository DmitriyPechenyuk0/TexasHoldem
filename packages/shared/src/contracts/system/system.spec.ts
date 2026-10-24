import {
	LivenessResponse,
	ReadinessResponse,
	ServerTimeResponse,
} from "./index.js";

describe("system contracts", () => {
	it("ServerTimeResponse holds an ISO 8601 UTC timestamp", () => {
		expect(
			ServerTimeResponse.parse({ now: "2026-10-23T12:00:00.000Z" }).now,
		).toBe("2026-10-23T12:00:00.000Z");
		expect(ServerTimeResponse.safeParse({ now: "yesterday" }).success).toBe(
			false,
		);
		expect(
			ServerTimeResponse.safeParse({ now: "2026-10-23T15:00:00+03:00" })
				.success,
		).toBe(false);
	});

	it("health responses report the status of each dependency", () => {
		expect(LivenessResponse.parse({ status: "ok" })).toEqual({ status: "ok" });
		expect(
			ReadinessResponse.parse({
				status: "not-ready",
				checks: { database: "up", redis: "down" },
			}).checks,
		).toEqual({ database: "up", redis: "down" });
		expect(
			ReadinessResponse.safeParse({
				status: "ready",
				checks: { redis: "flaky" },
			}).success,
		).toBe(false);
	});
});
