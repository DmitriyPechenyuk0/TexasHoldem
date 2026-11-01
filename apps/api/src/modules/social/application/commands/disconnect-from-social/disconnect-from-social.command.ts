import { Command } from "@nestjs/cqrs";

/** A socket of the player's left `/social`. */
export class DisconnectFromSocialCommand extends Command<void> {
	constructor(
		readonly userId: string,
		readonly connectionId: string,
	) {
		super();
	}
}
