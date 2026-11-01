import { Command } from "@nestjs/cqrs";

/** A socket of the player's connected to `/social`. */
export class ConnectToSocialCommand extends Command<void> {
	constructor(
		readonly userId: string,
		readonly connectionId: string,
	) {
		super();
	}
}
