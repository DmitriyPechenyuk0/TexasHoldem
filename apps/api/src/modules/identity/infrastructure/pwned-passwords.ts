import { createHash } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { PasswordBreaches } from "../application/password-breaches.js";

/** Have I Been Pwned's range API: answers the hash suffixes that share a 5-character prefix. */
export const PWNED_RANGE_URL = "https://api.pwnedpasswords.com/range/";

/** A sign-up waits at most this long for the answer, then goes on without it. */
export const PWNED_TIMEOUT_MS = 3_000;

/**
 * Checks passwords against Have I Been Pwned with k-anonymity: only the first 5 hex characters of
 * the password's SHA-1 leave the server, and padding hides how many suffixes matched.
 */
@Injectable()
export class PwnedPasswords extends PasswordBreaches {
	private readonly logger = new Logger(PwnedPasswords.name);

	async isBreached(password: string): Promise<boolean | null> {
		const hash = createHash("sha1")
			.update(password)
			.digest("hex")
			.toUpperCase();
		const prefix = hash.slice(0, 5);
		const suffix = hash.slice(5);
		try {
			const response = await fetch(`${PWNED_RANGE_URL}${prefix}`, {
				headers: { "Add-Padding": "true" },
				signal: AbortSignal.timeout(PWNED_TIMEOUT_MS),
			});
			if (!response.ok) {
				throw new Error(`status ${response.status}`);
			}
			// One `SUFFIX:COUNT` per line; padding lines have a count of 0.
			return (await response.text()).split(/\r?\n/).some((line) => {
				const [candidate, count] = line.split(":");
				return candidate === suffix && Number(count) > 0;
			});
		} catch (error) {
			this.logger.warn(`Breached-password check skipped: ${String(error)}`);
			return null;
		}
	}
}
