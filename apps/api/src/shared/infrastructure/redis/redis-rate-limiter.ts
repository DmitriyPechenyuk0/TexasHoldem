import { Inject, Injectable, Logger } from "@nestjs/common";
import {
	type RateLimitDecision,
	RateLimiter,
	type RateLimitRule,
} from "../../application/rate-limiter.js";
import { InjectRedis, type Redis } from "./redis.js";

/** Prefix of every counter's key. Tests give each app its own, since they share one Redis. */
export const RATE_LIMIT_NAMESPACE = Symbol("RateLimitNamespace");

// One round trip, so concurrent hits from several instances cannot all pass a stale count.
const CONSUME = `
local hits = redis.call("INCR", KEYS[1])
if hits == 1 then
	redis.call("EXPIRE", KEYS[1], ARGV[1])
end
return { hits, redis.call("TTL", KEYS[1]) }
`;

/**
 * Fixed-window counters in Redis. With Redis unavailable every hit is allowed: refusing them would
 * turn an outage into a sign-in outage, and Redis comes back on its own.
 */
@Injectable()
export class RedisRateLimiter extends RateLimiter {
	private readonly logger = new Logger(RateLimiter.name);
	private failing = false;

	constructor(
		@InjectRedis() private readonly redis: Redis,
		@Inject(RATE_LIMIT_NAMESPACE) private readonly namespace: string,
	) {
		super();
	}

	async consume(key: string, rule: RateLimitRule): Promise<RateLimitDecision> {
		let reply: unknown;
		try {
			reply = await this.redis.eval(CONSUME, {
				keys: [this.keyOf(key)],
				arguments: [String(rule.windowSeconds)],
			});
		} catch (error) {
			if (!this.failing) {
				this.failing = true;
				this.logger.warn(
					`Rate limits are off until Redis answers: ${(error as Error).message}`,
				);
			}
			return { allowed: true };
		}
		this.failing = false;
		const [hits, ttl] = reply as [number, number];
		return hits <= rule.max
			? { allowed: true }
			: { allowed: false, retryAfterSeconds: Math.max(ttl, 1) };
	}

	async reset(key: string): Promise<void> {
		await this.redis.del(this.keyOf(key));
	}

	private keyOf(key: string): string {
		return `${this.namespace}:${key}`;
	}
}
