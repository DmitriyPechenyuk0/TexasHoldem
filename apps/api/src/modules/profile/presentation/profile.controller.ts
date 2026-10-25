import { Username } from "@holdem/shared/contracts/identity";
import {
	type MyProfileResponse,
	type PublicProfileResponse,
	UpdateLocaleRequest,
	UpdateNicknameRequest,
} from "@holdem/shared/contracts/profile";
import { Controller, Get, Put, UseGuards } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import type { Viewer } from "@/shared/application/viewer.js";
import { AuthGuard, CurrentUser } from "@/shared/presentation/auth.guard.js";
import {
	ValidBody,
	ValidParam,
} from "@/shared/presentation/request-validation.js";
import { UpdateLocaleCommand } from "../application/commands/update-locale/update-locale.command.js";
import { UpdateNicknameCommand } from "../application/commands/update-nickname/update-nickname.command.js";
import { GetMyProfileQuery } from "../application/queries/get-my-profile/get-my-profile.query.js";
import { GetPublicProfileQuery } from "../application/queries/get-public-profile/get-public-profile.query.js";

/** The signed-in player's own profile under `/api/profile`; anyone's public one under `/api/profiles`. */
@Controller()
export class ProfileController {
	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
	) {}

	@Get("profile")
	@UseGuards(AuthGuard)
	mine(@CurrentUser() viewer: Viewer): Promise<MyProfileResponse> {
		return this.queryBus.execute(new GetMyProfileQuery(viewer.userId));
	}

	/** Answers the updated profile, so the client shows the nickname as it was stored. */
	@Put("profile/nickname")
	@UseGuards(AuthGuard)
	async updateNickname(
		@CurrentUser() viewer: Viewer,
		@ValidBody(UpdateNicknameRequest) { nickname }: UpdateNicknameRequest,
	): Promise<MyProfileResponse> {
		await this.commandBus.execute(
			new UpdateNicknameCommand(viewer.userId, nickname),
		);
		return this.mine(viewer);
	}

	@Put("profile/locale")
	@UseGuards(AuthGuard)
	async updateLocale(
		@CurrentUser() viewer: Viewer,
		@ValidBody(UpdateLocaleRequest) { locale }: UpdateLocaleRequest,
	): Promise<MyProfileResponse> {
		await this.commandBus.execute(
			new UpdateLocaleCommand(viewer.userId, locale),
		);
		return this.mine(viewer);
	}

	@Get("profiles/:username")
	byUsername(
		@ValidParam("username", Username) username: string,
	): Promise<PublicProfileResponse> {
		return this.queryBus.execute(new GetPublicProfileQuery(username));
	}
}
