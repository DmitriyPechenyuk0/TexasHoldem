import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { Email } from "@/shared/application/mailer.js";
import {
	RateLimiter,
	type RateLimitRule,
} from "@/shared/application/rate-limiter.js";

/** The emails anyone can trigger with just an address; each kind is throttled on its own. */
export type EmailKind = Extract<
	Email["template"],
	"verify-email" | "reset-password"
>;

/** Per address and kind: one email a minute, three an hour. */
export const EMAIL_RULES = {
	minute: { max: 1, windowSeconds: 60 },
	hour: { max: 3, windowSeconds: 60 * 60 },
} as const satisfies Record<string, RateLimitRule>;

/** The keys are digests, so Redis holds no addresses. */
export function emailThrottleKeys(
	kind: EmailKind,
	email: string,
): Record<keyof typeof EMAIL_RULES, string> {
	const digest = createHash("sha256").update(email.toLowerCase()).digest("hex");
	const key = `identity:email:${kind}:${digest}`;
	return { minute: `${key}:minute`, hour: `${key}:hour` };
}

/**
 * Throttles the emails anyone can trigger with just an address, shared by every api instance, so a
 * stranger cannot flood an inbox from many IPs. The request still answers as if the email went
 * out: a refusal would tell which addresses have an account. Every counted email reaches the owner,
 * so whoever spends an address's quota hands the owner working links.
 */
@Injectable()
export class EmailThrottle {
	constructor(private readonly limiter: RateLimiter) {}

	/** true when the email may go out now; it then counts against the address's quota. */
	async claim(kind: EmailKind, email: string): Promise<boolean> {
		const keys = emailThrottleKeys(kind, email);
		// The minute first: an email it refuses must not spend the hour's quota.
		const minute = await this.limiter.consume(keys.minute, EMAIL_RULES.minute);
		if (!minute.allowed) {
			return false;
		}
		return (await this.limiter.consume(keys.hour, EMAIL_RULES.hour)).allowed;
	}
}
