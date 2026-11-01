import { CommandHandler, EventBus, type ICommandHandler } from "@nestjs/cqrs";
import { PresenceChanged } from "../../events/presence-changed.event.js";
import { PlayerPresence } from "../../player-presence.js";
import { ConnectToSocialCommand } from "./connect-to-social.command.js";

/** The player's first connection shows them online; more tabs, or a reload in time, change nothing. */
@CommandHandler(ConnectToSocialCommand)
export class ConnectToSocialHandler implements ICommandHandler<ConnectToSocialCommand> {
	constructor(
		private readonly presence: PlayerPresence,
		private readonly eventBus: EventBus,
	) {}

	async execute({
		userId,
		connectionId,
	}: ConnectToSocialCommand): Promise<void> {
		if (await this.presence.connect(userId, connectionId)) {
			this.eventBus.publish(new PresenceChanged(userId));
		}
	}
}
