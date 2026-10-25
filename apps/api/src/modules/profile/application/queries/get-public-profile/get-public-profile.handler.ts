import type { PublicProfileResponse } from "@holdem/shared/contracts/profile";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { eq } from "drizzle-orm";
import {
	type Database,
	InjectDatabase,
} from "@/shared/infrastructure/database/index.js";
import { ProfileNotFoundError } from "../../../domain/profile-not-found.error.js";
import { profiles } from "../../../infrastructure/persistence/schema.js";
import { GetPublicProfileQuery } from "./get-public-profile.query.js";

@QueryHandler(GetPublicProfileQuery)
export class GetPublicProfileHandler implements IQueryHandler<GetPublicProfileQuery> {
	constructor(@InjectDatabase() private readonly db: Database) {}

	async execute({
		username,
	}: GetPublicProfileQuery): Promise<PublicProfileResponse> {
		const [profile] = await this.db
			.select({
				username: profiles.username,
				nickname: profiles.nickname,
				createdAt: profiles.createdAt,
			})
			.from(profiles)
			.where(eq(profiles.username, username.toLowerCase()));
		if (!profile) {
			throw new ProfileNotFoundError();
		}
		return { ...profile, createdAt: profile.createdAt.toISOString() };
	}
}
