import { CommandHandler, type ICommandHandler, QueryBus } from "@nestjs/cqrs";
import { Clock } from "@/shared/application/clock.js";
import { GetPlayerCardsQuery } from "@/shared/application/player-directory.js";
import {
	MutedPlayerNotFoundError,
	MuteSelfError,
} from "../../../domain/chat-errors.js";
import { MuteListRepository } from "../../../domain/mute-list.repository.js";
import { MutePlayerCommand } from "./mute-player.command.js";

@CommandHandler(MutePlayerCommand)
export class MutePlayerHandler implements ICommandHandler<MutePlayerCommand> {
	constructor(
		private readonly mutes: MuteListRepository,
		private readonly queryBus: QueryBus,
		private readonly clock: Clock,
	) {}

	async execute({ userId, mutedId }: MutePlayerCommand): Promise<void> {
		if (mutedId === userId) {
			throw new MuteSelfError();
		}
		const [player] = await this.queryBus.execute(
			new GetPlayerCardsQuery([mutedId]),
		);
		if (!player) {
			throw new MutedPlayerNotFoundError();
		}
		await this.mutes.mute(userId, mutedId, this.clock.now());
	}
}
