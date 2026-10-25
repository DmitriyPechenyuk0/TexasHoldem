/** At most `max` hits per window of `windowSeconds`; the window starts with the first hit. */
export interface RateLimitRule {
	readonly max: number;
	readonly windowSeconds: number;
}

export type RateLimitDecision =
	| { readonly allowed: true }
	| { readonly allowed: false; readonly retryAfterSeconds: number };

/** Port for counters shared by every api instance; the adapter keeps them in Redis. */
export abstract class RateLimiter {
	/** Counts one hit against `key`, refused ones included. */
	abstract consume(
		key: string,
		rule: RateLimitRule,
	): Promise<RateLimitDecision>;

	/** Forgets every hit on `key`. */
	abstract reset(key: string): Promise<void>;
}
