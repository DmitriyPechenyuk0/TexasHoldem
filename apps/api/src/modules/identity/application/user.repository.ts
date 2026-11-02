import type { Locale, UserId } from "@holdem/shared";
import type { AccountSummary } from "@/shared/application/accounts.js";

/** What a user without a username learns from choosing one. */
export type ChooseUsernameOutcome =
	| {
			readonly kind: "chosen";
			readonly locale: string;
			readonly emailVerified: boolean;
	  }
	| { readonly kind: "taken" | "already-chosen" | "not-found" };

/** Port for what identity changes in its own user records outside Better Auth's endpoints. */
export abstract class UserRepository {
	abstract setLocale(userId: UserId, locale: Locale): Promise<void>;

	/** Sets `username`, already lowercase, on an account that has none, atomically. */
	abstract chooseUsername(
		userId: UserId,
		username: string,
	): Promise<ChooseUsernameOutcome>;

	/** Accounts whose email is `search`, or whose username starts with it, in any case. */
	abstract find(
		search: string,
		limit: number,
	): Promise<readonly AccountSummary[]>;

	/** Ends every session of the account; answers how many there were. */
	abstract revokeSessions(userId: string): Promise<number>;
}
