import { Module } from "@nestjs/common";
import { CreateProfileHandler } from "./application/commands/create-profile/create-profile.handler.js";
import { UpdateLocaleHandler } from "./application/commands/update-locale/update-locale.handler.js";
import { UpdateNicknameHandler } from "./application/commands/update-nickname/update-nickname.handler.js";
import { UserRegisteredHandler } from "./application/events/user-registered.handler.js";
import { GetMyProfileHandler } from "./application/queries/get-my-profile/get-my-profile.handler.js";
import { GetPublicProfileHandler } from "./application/queries/get-public-profile/get-public-profile.handler.js";
import { ProfileRepository } from "./domain/profile.repository.js";
import { DrizzleProfileRepository } from "./infrastructure/persistence/drizzle-profile.repository.js";
import { ProfileController } from "./presentation/profile.controller.js";

/**
 * How players appear to others: nickname (not unique, unlike the username), avatar and language.
 * A profile is created for every account on identity's `UserRegistered`.
 */
@Module({
	controllers: [ProfileController],
	providers: [
		{ provide: ProfileRepository, useClass: DrizzleProfileRepository },
		CreateProfileHandler,
		UpdateNicknameHandler,
		UpdateLocaleHandler,
		UserRegisteredHandler,
		GetMyProfileHandler,
		GetPublicProfileHandler,
	],
})
export class ProfileModule {}
