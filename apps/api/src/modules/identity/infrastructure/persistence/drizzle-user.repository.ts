import type { Locale, UserId } from "@holdem/shared";
import { Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import {
	type Database,
	InjectDatabase,
} from "@/shared/infrastructure/database/index.js";
import { UserRepository } from "../../application/user.repository.js";
import { users } from "./schema.js";

@Injectable()
export class DrizzleUserRepository extends UserRepository {
	constructor(@InjectDatabase() private readonly db: Database) {
		super();
	}

	async setLocale(userId: UserId, locale: Locale): Promise<void> {
		await this.db.update(users).set({ locale }).where(eq(users.id, userId));
	}
}
