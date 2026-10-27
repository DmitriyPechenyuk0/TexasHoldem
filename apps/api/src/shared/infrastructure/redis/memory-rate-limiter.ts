import {
	type RateLimitDecision,
	RateLimiter,
	type RateLimitRule,
} from "../../application/rate-limiter.js";

/** Counters kept at most; past it, expired ones go first, then the oldest. */
export const MEMORY_RATE_LIMIT_MAX_KEYS = 100_000;

interface Window {
	hits: number;
	readonly endsAt: number;
}

/**
 * Fixed-window counters in this process's memory, for while Redis cannot be reached: each instance
 * then counts on its own, which is looser than the shared limits but never unlimited.
 */
export class MemoryRateLimiter extends RateLimiter {
	private readonly windows = new Map<string, Window>();

	constructor(
		private readonly now: () => number = Date.now,
		private readonly maxKeys = MEMORY_RATE_LIMIT_MAX_KEYS,
	) {
		super();
	}

	async consume(key: string, rule: RateLimitRule): Promise<RateLimitDecision> {
		const now = this.now();
		let window = this.windows.get(key);
		if (!window || window.endsAt <= now) {
			this.windows.delete(key);
			this.makeRoom(now);
			window = { hits: 0, endsAt: now + rule.windowSeconds * 1000 };
			this.windows.set(key, window);
		}
		window.hits += 1;
		return window.hits <= rule.max
			? { allowed: true }
			: {
					allowed: false,
					retryAfterSeconds: Math.max(
						Math.ceil((window.endsAt - now) / 1000),
						1,
					),
				};
	}

	async reset(key: string): Promise<void> {
		this.windows.delete(key);
	}

	private makeRoom(now: number): void {
		if (this.windows.size < this.maxKeys) {
			return;
		}
		for (const [key, window] of this.windows) {
			if (window.endsAt <= now) {
				this.windows.delete(key);
			}
		}
		// A Map iterates in insertion order, so the first keys are the oldest windows.
		for (const key of this.windows.keys()) {
			if (this.windows.size < this.maxKeys) {
				break;
			}
			this.windows.delete(key);
		}
	}
}
