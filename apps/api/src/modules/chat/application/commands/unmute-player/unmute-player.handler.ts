import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { MuteListRepository } from "../../../domain/mute-list.repository.js";
import { UnmutePlayerCommand } from "./unmute-player.command.js";

@CommandHandler(UnmutePlayerCommand)
export class UnmutePlayerHandler implements ICommandHandler<UnmutePlayerCommand> {
	constructor(private readonly mutes: MuteListRepository) {}

	execute({ userId, mutedId }: UnmutePlayerCommand): Promise<void> {
		return this.mutes.unmute(userId, mutedId);
	}
}
