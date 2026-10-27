import {
	ChooseUsernameRequest,
	type MeResponse,
	type OAuthProvidersResponse,
} from "@holdem/shared/contracts/identity";
import { Controller, Get, Put, UseGuards } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import type { Viewer } from "@/shared/application/viewer.js";
import { AuthGuard, CurrentUser } from "@/shared/presentation/auth.guard.js";
import { ValidBody } from "@/shared/presentation/request-validation.js";
import { ChooseUsernameCommand } from "../application/commands/choose-username/choose-username.command.js";
import { GetMeQuery } from "../application/queries/get-me/get-me.query.js";
import { GetOAuthProvidersQuery } from "../application/queries/get-oauth-providers/get-oauth-providers.query.js";

/** The signed-in user's account under `/api/me`, and the sign-in options anyone may read. */
@Controller()
export class MeController {
	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
	) {}

	@Get("me")
	@UseGuards(AuthGuard)
	me(@CurrentUser() viewer: Viewer): Promise<MeResponse> {
		return this.queryBus.execute(new GetMeQuery(viewer.userId));
	}

	/** Answers the account, so the client has the username as it was stored. */
	@Put("me/username")
	@UseGuards(AuthGuard)
	async chooseUsername(
		@CurrentUser() viewer: Viewer,
		@ValidBody(ChooseUsernameRequest) { username }: ChooseUsernameRequest,
	): Promise<MeResponse> {
		await this.commandBus.execute(
			new ChooseUsernameCommand(viewer.userId, username),
		);
		return this.me(viewer);
	}

	@Get("oauth-providers")
	oauthProviders(): Promise<OAuthProvidersResponse> {
		return this.queryBus.execute(new GetOAuthProvidersQuery());
	}
}
