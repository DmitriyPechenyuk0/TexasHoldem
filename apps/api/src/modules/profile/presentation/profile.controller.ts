import { Username } from "@holdem/shared/contracts/identity";
import {
	type AvatarUploadResponse,
	ConfirmAvatarUploadRequest,
	type MyProfileResponse,
	type PublicProfileResponse,
	RequestAvatarUploadRequest,
	UpdateLocaleRequest,
	UpdateNicknameRequest,
} from "@holdem/shared/contracts/profile";
import {
	Controller,
	Delete,
	Get,
	HttpCode,
	Post,
	Put,
	Res,
	UseGuards,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import type { Response } from "express";
import {
	RateLimiter,
	type RateLimitRule,
} from "@/shared/application/rate-limiter.js";
import type { Viewer } from "@/shared/application/viewer.js";
import { AuthGuard, CurrentUser } from "@/shared/presentation/auth.guard.js";
import { rateLimited } from "@/shared/presentation/rate-limited.js";
import { RequirePlayer } from "@/shared/presentation/require-player.guard.js";
import {
	ValidBody,
	ValidParam,
} from "@/shared/presentation/request-validation.js";
import { ConfirmAvatarUploadCommand } from "../application/commands/confirm-avatar-upload/confirm-avatar-upload.command.js";
import { RemoveAvatarCommand } from "../application/commands/remove-avatar/remove-avatar.command.js";
import { RequestAvatarUploadCommand } from "../application/commands/request-avatar-upload/request-avatar-upload.command.js";
import { UpdateLocaleCommand } from "../application/commands/update-locale/update-locale.command.js";
import { UpdateNicknameCommand } from "../application/commands/update-nickname/update-nickname.command.js";
import { GetMyProfileQuery } from "../application/queries/get-my-profile/get-my-profile.query.js";
import { GetPublicProfileQuery } from "../application/queries/get-public-profile/get-public-profile.query.js";

/** Avatar uploads per player: storage space is what they spend. */
export const AVATAR_UPLOAD_RULE: RateLimitRule = {
	max: 10,
	windowSeconds: 60 * 60,
};

/**
 * The signed-in player's own profile under `/api/profile`; anyone's public one under `/api/profiles`.
 * What others see is changed only by players: a username and a verified email.
 */
@Controller()
export class ProfileController {
	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
		private readonly limiter: RateLimiter,
	) {}

	@Get("profile")
	@UseGuards(AuthGuard)
	mine(@CurrentUser() viewer: Viewer): Promise<MyProfileResponse> {
		return this.queryBus.execute(new GetMyProfileQuery(viewer.userId));
	}

	/** Answers the updated profile, so the client shows the nickname as it was stored. */
	@Put("profile/nickname")
	@UseGuards(AuthGuard, RequirePlayer)
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
	@UseGuards(AuthGuard, RequirePlayer)
	async updateLocale(
		@CurrentUser() viewer: Viewer,
		@ValidBody(UpdateLocaleRequest) { locale }: UpdateLocaleRequest,
	): Promise<MyProfileResponse> {
		await this.commandBus.execute(
			new UpdateLocaleCommand(viewer.userId, locale),
		);
		return this.mine(viewer);
	}

	@Post("profile/avatar/upload")
	@HttpCode(200)
	@UseGuards(AuthGuard, RequirePlayer)
	async requestAvatarUpload(
		@CurrentUser() viewer: Viewer,
		@ValidBody(RequestAvatarUploadRequest)
		{ contentType }: RequestAvatarUploadRequest,
		@Res({ passthrough: true }) response: Response,
	): Promise<AvatarUploadResponse> {
		const decision = await this.limiter.consume(
			`profile:avatar-upload:${viewer.userId}`,
			AVATAR_UPLOAD_RULE,
		);
		if (!decision.allowed) {
			throw rateLimited(response, decision.retryAfterSeconds);
		}
		return this.commandBus.execute(
			new RequestAvatarUploadCommand(viewer.userId, contentType),
		);
	}

	@Put("profile/avatar")
	@UseGuards(AuthGuard, RequirePlayer)
	async confirmAvatarUpload(
		@CurrentUser() viewer: Viewer,
		@ValidBody(ConfirmAvatarUploadRequest) { key }: ConfirmAvatarUploadRequest,
	): Promise<MyProfileResponse> {
		await this.commandBus.execute(
			new ConfirmAvatarUploadCommand(viewer.userId, key),
		);
		return this.mine(viewer);
	}

	@Delete("profile/avatar")
	@UseGuards(AuthGuard, RequirePlayer)
	async removeAvatar(
		@CurrentUser() viewer: Viewer,
	): Promise<MyProfileResponse> {
		await this.commandBus.execute(new RemoveAvatarCommand(viewer.userId));
		return this.mine(viewer);
	}

	@Get("profiles/:username")
	byUsername(
		@ValidParam("username", Username) username: string,
	): Promise<PublicProfileResponse> {
		return this.queryBus.execute(new GetPublicProfileQuery(username));
	}
}
