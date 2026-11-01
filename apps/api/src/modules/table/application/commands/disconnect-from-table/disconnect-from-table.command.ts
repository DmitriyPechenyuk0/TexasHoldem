import { Command } from "@nestjs/cqrs";

/**
 * A connection stops following a table, or closes: when it was its user's last one there, a player
 * is disconnected and a spectator stops watching.
 */
export class DisconnectFromTableCommand extends Command<void> {
	constructor(
		readonly tableId: string,
		readonly userId: string,
		readonly connectionId: string,
	) {
		super();
	}
}
