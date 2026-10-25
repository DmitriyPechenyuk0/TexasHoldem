import { Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import {
	type Database,
	InjectDatabase,
} from "@/shared/infrastructure/database/index.js";
import type { Nickname } from "../../domain/nickname.js";
import type { Profile } from "../../domain/profile.js";
import { ProfileRepository } from "../../domain/profile.repository.js";
import { profiles } from "./schema.js";

@Injectable()
export class DrizzleProfileRepository extends ProfileRepository {
	constructor(@InjectDatabase() private readonly db: Database) {
		super();
	}

	async findByUserId(userId: string): Promise<Profile | null> {
		const [row] = await this.db
			.select()
			.from(profiles)
			.where(eq(profiles.userId, userId));
		return row
			? {
					userId: row.userId,
					username: row.username,
					// Stored only after passing the rules.
					nickname: row.nickname as Nickname,
					avatarKey: row.avatarKey,
					locale: row.locale,
					createdAt: row.createdAt,
				}
			: null;
	}

	async add(profile: Profile): Promise<boolean> {
		const inserted = await this.db
			.insert(profiles)
			.values(profile)
			.onConflictDoNothing({ target: profiles.userId })
			.returning({ userId: profiles.userId });
		return inserted.length > 0;
	}

	async save({ userId, nickname, avatarKey, locale }: Profile): Promise<void> {
		await this.db
			.update(profiles)
			.set({ nickname, avatarKey, locale })
			.where(eq(profiles.userId, userId));
	}
}
