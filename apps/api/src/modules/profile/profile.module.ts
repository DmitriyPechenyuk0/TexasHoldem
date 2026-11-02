import { Module } from "@nestjs/common";
import { AvatarImages } from "./application/avatar-images.js";
import { ConfirmAvatarUploadHandler } from "./application/commands/confirm-avatar-upload/confirm-avatar-upload.handler.js";
import { CreateProfileHandler } from "./application/commands/create-profile/create-profile.handler.js";
import { RemoveAvatarHandler } from "./application/commands/remove-avatar/remove-avatar.handler.js";
import { RequestAvatarUploadHandler } from "./application/commands/request-avatar-upload/request-avatar-upload.handler.js";
import { UpdateLocaleHandler } from "./application/commands/update-locale/update-locale.handler.js";
import { UpdateNicknameHandler } from "./application/commands/update-nickname/update-nickname.handler.js";
import { UserRegisteredHandler } from "./application/events/user-registered.handler.js";
import { FindPlayerHandler } from "./application/queries/find-player/find-player.handler.js";
import { GetMyProfileHandler } from "./application/queries/get-my-profile/get-my-profile.handler.js";
import { GetPlayerCardsHandler } from "./application/queries/get-player-cards/get-player-cards.handler.js";
import { GetPublicProfileHandler } from "./application/queries/get-public-profile/get-public-profile.handler.js";
import { SearchPlayersHandler } from "./application/queries/search-players/search-players.handler.js";
import { ProfileRepository } from "./domain/profile.repository.js";
import { SharpAvatarImages } from "./infrastructure/images/sharp-avatar-images.js";
import { DrizzleProfileRepository } from "./infrastructure/persistence/drizzle-profile.repository.js";
import { ProfileController } from "./presentation/profile.controller.js";

/**
 * How players appear to others: nickname (not unique, unlike the username), avatar and language.
 * A profile is created for every account on identity's `UserRegistered`. Answers who the players
 * are to other contexts (`shared/application/player-directory.ts`).
 */
@Module({
	controllers: [ProfileController],
	providers: [
		{ provide: ProfileRepository, useClass: DrizzleProfileRepository },
		{ provide: AvatarImages, useClass: SharpAvatarImages },
		CreateProfileHandler,
		RequestAvatarUploadHandler,
		ConfirmAvatarUploadHandler,
		RemoveAvatarHandler,
		UpdateNicknameHandler,
		UpdateLocaleHandler,
		UserRegisteredHandler,
		GetMyProfileHandler,
		GetPublicProfileHandler,
		GetPlayerCardsHandler,
		FindPlayerHandler,
		SearchPlayersHandler,
	],
})
export class ProfileModule {}
