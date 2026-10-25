import type { Locale, UserId } from "@holdem/shared";

/** Port for what identity changes in its own user records outside Better Auth's endpoints. */
export abstract class UserRepository {
	abstract setLocale(userId: UserId, locale: Locale): Promise<void>;
}
