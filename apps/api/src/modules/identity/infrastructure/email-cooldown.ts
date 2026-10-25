import { createHash } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import {
	InjectRedis,
	type Redis,
} from "@/shared/infrastructure/redis/index.js";

/** At most one email of a kind to an address in this many seconds, on top of the per-IP limit. */
export const EMAIL_COOLDOWN_SECONDS = 60;

export type EmailKind = "verify-email";

/** The key is a digest, so Redis holds no addresses. */
export const emailCooldownKey = (kind: EmailKind, email: string): string =>
	`identity:email-cooldown:${kind}:${createHash("sha256").update(email.toLowerCase()).digest("hex")}`;

/**
 * Per-address cooldown for the emails anyone can trigger with just an address, shared by every api
 * instance through Redis. It keeps a stranger from flooding someone's inbox from many IPs.
 */
@Injectable()
export class EmailCooldown {
	private readonly logger = new Logger(EmailCooldown.name);

	constructor(@InjectRedis() private readonly redis: Redis) {}

	/**
	 * true when no email of this kind went to the address within the cooldown, which starts again
	 * now. With Redis unavailable it is true as well: the user needs the email to get in, and the
	 * per-IP limit still holds.
	 */
	async claim(kind: EmailKind, email: string): Promise<boolean> {
		try {
			const reply = await this.redis.set(emailCooldownKey(kind, email), "1", {
				condition: "NX",
				expiration: { type: "EX", value: EMAIL_COOLDOWN_SECONDS },
			});
			return reply === "OK";
		} catch (error) {
			this.logger.warn(
				`Sending the ${kind} email without a cooldown: ${(error as Error).message}`,
			);
			return true;
		}
	}
}
