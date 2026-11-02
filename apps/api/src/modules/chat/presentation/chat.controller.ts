import { UserId } from "@holdem/shared";
import type { MutesResponse } from "@holdem/shared/contracts/chat";
import {
	Controller,
	Delete,
	Get,
	HttpCode,
	Put,
	UseGuards,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import type { Viewer } from "@/shared/application/viewer.js";
import { AuthGuard, CurrentUser } from "@/shared/presentation/auth.guard.js";
import { ValidParam } from "@/shared/presentation/request-validation.js";
import { RequirePlayer } from "@/shared/presentation/require-player.guard.js";
import { MutePlayerCommand } from "../application/commands/mute-player/mute-player.command.js";
import { UnmutePlayerCommand } from "../application/commands/unmute-player/unmute-player.command.js";
import { GetMutesQuery } from "../application/queries/get-mutes/get-mutes.query.js";

/**
 * The signed-in player's mute list under `/api/chat/mutes`: kept on the server, so it is the same
 * on every device; the client hides muted players' messages. Muting is idempotent both ways.
 */
@Controller("chat/mutes")
@UseGuards(AuthGuard)
export class ChatController {
	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
	) {}

	@Get()
	async mutes(@CurrentUser() viewer: Viewer): Promise<MutesResponse> {
		const muted = await this.queryBus.execute(new GetMutesQuery(viewer.userId));
		return muted.map(({ mutedAt, ...player }) => ({
			...player,
			userId: player.userId as UserId,
			mutedAt: mutedAt.toISOString(),
		}));
	}

	/** Oneself is `chat.mute-self`; an unknown player `chat.player-not-found`. */
	@Put(":userId")
	@HttpCode(204)
	@UseGuards(RequirePlayer)
	async mute(
		@CurrentUser() viewer: Viewer,
		@ValidParam("userId", UserId) mutedId: string,
	): Promise<void> {
		await this.commandBus.execute(
			new MutePlayerCommand(viewer.userId, mutedId),
		);
	}

	@Delete(":userId")
	@HttpCode(204)
	@UseGuards(RequirePlayer)
	async unmute(
		@CurrentUser() viewer: Viewer,
		@ValidParam("userId", UserId) mutedId: string,
	): Promise<void> {
		await this.commandBus.execute(
			new UnmutePlayerCommand(viewer.userId, mutedId),
		);
	}
}
