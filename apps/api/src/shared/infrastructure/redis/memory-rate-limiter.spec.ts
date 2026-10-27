import { MemoryRateLimiter } from "./memory-rate-limiter.js";

const RULE = { max: 2, windowSeconds: 60 };

describe("MemoryRateLimiter", () => {
	it("allows up to max hits per window, then gives the window's time left", async () => {
		let now = 0;
		const limiter = new MemoryRateLimiter(() => now);

		expect(await limiter.consume("k", RULE)).toEqual({ allowed: true });
		expect(await limiter.consume("k", RULE)).toEqual({ allowed: true });
		now = 18_500;
		expect(await limiter.consume("k", RULE)).toEqual({
			allowed: false,
			retryAfterSeconds: 42,
		});
		// Other keys count on their own.
		expect(await limiter.consume("other", RULE)).toEqual({ allowed: true });
	});

	it("starts a new window once the old one ends, and forgets a reset key", async () => {
		let now = 0;
		const limiter = new MemoryRateLimiter(() => now);
		for (let hit = 0; hit < 3; hit++) {
			await limiter.consume("k", RULE);
		}

		now = 60_000;
		expect(await limiter.consume("k", RULE)).toEqual({ allowed: true });
		await limiter.consume("k", RULE);
		await limiter.reset("k");
		expect(await limiter.consume("k", RULE)).toEqual({ allowed: true });
	});

	it("keeps at most maxKeys counters, dropping expired ones and then the oldest", async () => {
		let now = 0;
		const limiter = new MemoryRateLimiter(() => now, 2);
		const strict = { max: 1, windowSeconds: 60 };
		await limiter.consume("a", { max: 1, windowSeconds: 1 });
		await limiter.consume("b", strict);

		now = 1_000;
		// "a" has expired, so "c" takes its place and "b" still counts.
		await limiter.consume("c", strict);
		expect((await limiter.consume("b", strict)).allowed).toBe(false);

		// Nothing has expired now: the oldest, "b", goes.
		await limiter.consume("d", strict);
		expect((await limiter.consume("b", strict)).allowed).toBe(true);
	});
});
