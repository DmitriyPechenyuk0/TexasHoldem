import {
	type RateLimitDecision,
	RateLimiter,
	type RateLimitRule,
} from "@/shared/application/rate-limiter.js";
import {
	EMAIL_RULES,
	EmailThrottle,
	emailThrottleKeys,
} from "./email-throttle.js";

/** Counts in memory, like the Redis adapter within one window. */
class CountingLimiter extends RateLimiter {
	readonly hits = new Map<string, number>();

	async consume(key: string, rule: RateLimitRule): Promise<RateLimitDecision> {
		const hits = (this.hits.get(key) ?? 0) + 1;
		this.hits.set(key, hits);
		return hits <= rule.max
			? { allowed: true }
			: { allowed: false, retryAfterSeconds: rule.windowSeconds };
	}

	async reset(key: string): Promise<void> {
		this.hits.delete(key);
	}
}

const ADDRESS = "alice@example.test";

describe("EmailThrottle", () => {
	it("lets one email a minute go to an address, under one key in any case", async () => {
		const limiter = new CountingLimiter();
		const throttle = new EmailThrottle(limiter);

		expect(await throttle.claim("verify-email", "Alice@Example.test")).toBe(
			true,
		);
		expect(await throttle.claim("verify-email", ADDRESS)).toBe(false);
		expect(await throttle.claim("reset-password", ADDRESS)).toBe(true);
	});

	it("lets three go in an hour, and a refusal within the minute spends none of them", async () => {
		const limiter = new CountingLimiter();
		const throttle = new EmailThrottle(limiter);
		const keys = emailThrottleKeys("verify-email", ADDRESS);

		const sent: boolean[] = [];
		for (let minute = 1; minute <= 4; minute++) {
			sent.push(await throttle.claim("verify-email", ADDRESS));
			sent.push(await throttle.claim("verify-email", ADDRESS));
			await limiter.reset(keys.minute);
		}

		expect(sent).toEqual([true, false, true, false, true, false, false, false]);
		expect(limiter.hits.get(keys.hour)).toBe(EMAIL_RULES.hour.max + 1);
	});

	it("keeps no address in its keys", () => {
		expect(
			Object.values(emailThrottleKeys("verify-email", ADDRESS)).join(),
		).not.toContain(ADDRESS);
	});
});
