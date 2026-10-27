import type { Locale, UserId } from "@holdem/shared";
import { Injectable } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import {
	type Database,
	InjectDatabase,
	isUniqueViolation,
} from "@/shared/infrastructure/database/index.js";
import {
	type ChooseUsernameOutcome,
	UserRepository,
} from "../../application/user.repository.js";
import { users } from "./schema.js";

@Injectable()
export class DrizzleUserRepository extends UserRepository {
	constructor(@InjectDatabase() private readonly db: Database) {
		super();
	}

	async setLocale(userId: UserId, locale: Locale): Promise<void> {
		await this.db.update(users).set({ locale }).where(eq(users.id, userId));
	}

	async chooseUsername(
		userId: UserId,
		username: string,
	): Promise<ChooseUsernameOutcome> {
		try {
			// Only while it has none, so two concurrent requests cannot both succeed.
			const [chosen] = await this.db
				.update(users)
				.set({ username, name: username })
				.where(and(eq(users.id, userId), isNull(users.username)))
				.returning({
					locale: users.locale,
					emailVerified: users.emailVerified,
				});
			if (chosen) {
				return { kind: "chosen", ...chosen };
			}
		} catch (error) {
			if (isUniqueViolation(error)) {
				return { kind: "taken" };
			}
			throw error;
		}
		const [existing] = await this.db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.id, userId));
		return { kind: existing ? "already-chosen" : "not-found" };
	}
}
