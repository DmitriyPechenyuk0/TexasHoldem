import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { PlayerPresence } from "../../player-presence.js";
import { PresenceSettler } from "../../presence-settler.js";
import { DisconnectFromSocialCommand } from "./disconnect-from-social.command.js";

/** The player goes offline only after the grace period, and only if no connection is left then. */
@CommandHandler(DisconnectFromSocialCommand)
export class DisconnectFromSocialHandler implements ICommandHandler<DisconnectFromSocialCommand> {
	constructor(
		private readonly presence: PlayerPresence,
		private readonly settler: PresenceSettler,
	) {}

	async execute({
		userId,
		connectionId,
	}: DisconnectFromSocialCommand): Promise<void> {
		await this.presence.disconnect(userId, connectionId);
		this.settler.later(userId);
	}
}
