import { Locale, UserId } from "@holdem/shared";
import type { MyProfileResponse } from "@holdem/shared/contracts/profile";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { eq } from "drizzle-orm";
import { ObjectStorage } from "@/shared/application/object-storage.js";
import {
	type Database,
	InjectDatabase,
} from "@/shared/infrastructure/database/index.js";
import { ProfileNotFoundError } from "../../../domain/profile-not-found.error.js";
import { profiles } from "../../../infrastructure/persistence/schema.js";
import { GetMyProfileQuery } from "./get-my-profile.query.js";

@QueryHandler(GetMyProfileQuery)
export class GetMyProfileHandler implements IQueryHandler<GetMyProfileQuery> {
	constructor(
		@InjectDatabase() private readonly db: Database,
		private readonly storage: ObjectStorage,
	) {}

	async execute({ userId }: GetMyProfileQuery): Promise<MyProfileResponse> {
		const [profile] = await this.db
			.select({
				userId: profiles.userId,
				username: profiles.username,
				nickname: profiles.nickname,
				avatarKey: profiles.avatarKey,
				locale: profiles.locale,
				createdAt: profiles.createdAt,
			})
			.from(profiles)
			.where(eq(profiles.userId, userId));
		if (!profile) {
			throw new ProfileNotFoundError();
		}
		const { avatarKey, ...rest } = profile;
		return {
			...rest,
			avatarUrl: avatarKey ? this.storage.publicUrl(avatarKey) : null,
			userId: UserId.parse(profile.userId),
			// A locale the app no longer supports reads as the default.
			locale: Locale.catch("en").parse(profile.locale),
			createdAt: profile.createdAt.toISOString(),
		};
	}
}
