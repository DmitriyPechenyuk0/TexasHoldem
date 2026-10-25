import { Logger } from "@nestjs/common";
import { RedisRateLimiter } from "./redis-rate-limiter.js";
import type { Redis } from "./redis.js";

const RULE = { max: 2, windowSeconds: 60 };

/** A Redis whose script answers come from `replies`; an Error is thrown instead of returned. */
function redisReplying(...replies: (readonly [number, number] | Error)[]) {
	const evalMock = vi.fn(async () => {
		const reply = replies.shift();
		if (reply instanceof Error) {
			throw reply;
		}
		return reply;
	});
	const del = vi.fn(async () => 1);
	return {
		redis: { eval: evalMock, del } as unknown as Redis,
		eval: evalMock,
		del,
	};
}

describe("RedisRateLimiter", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("allows up to max hits and then gives the window's time left", async () => {
		const { redis, eval: evalMock } = redisReplying([2, 60], [3, 42], [9, 0]);
		const limiter = new RedisRateLimiter(redis, "rate-limit");

		expect(await limiter.consume("sign-in:x", RULE)).toEqual({ allowed: true });
		expect(await limiter.consume("sign-in:x", RULE)).toEqual({
			allowed: false,
			retryAfterSeconds: 42,
		});
		// A key in its last second still asks the client to wait.
		expect(await limiter.consume("sign-in:x", RULE)).toEqual({
			allowed: false,
			retryAfterSeconds: 1,
		});
		expect(evalMock).toHaveBeenCalledWith(expect.any(String), {
			keys: ["rate-limit:sign-in:x"],
			arguments: ["60"],
		});
	});

	it("resets a key in its namespace", async () => {
		const { redis, del } = redisReplying();

		await new RedisRateLimiter(redis, "ns").reset("sign-in:x");

		expect(del).toHaveBeenCalledWith("ns:sign-in:x");
	});

	it("allows every hit while Redis fails, and warns once per outage", async () => {
		const warn = vi
			.spyOn(Logger.prototype, "warn")
			.mockImplementation(() => {});
		const down = new Error("The client is closed");
		const { redis } = redisReplying(down, down, [1, 60], down);
		const limiter = new RedisRateLimiter(redis, "rate-limit");

		for (let hit = 0; hit < 4; hit++) {
			expect(await limiter.consume("k", RULE)).toEqual({ allowed: true });
		}

		expect(warn).toHaveBeenCalledTimes(2);
		expect(warn).toHaveBeenCalledWith(
			"Rate limits are off until Redis answers: The client is closed",
		);
	});
});
