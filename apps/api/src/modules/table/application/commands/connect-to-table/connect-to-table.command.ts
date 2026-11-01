import { Command } from "@nestjs/cqrs";

/** A connection starts following a table: its user's first one there brings a player back. */
export class ConnectToTableCommand extends Command<void> {
	constructor(
		readonly tableId: string,
		readonly userId: string,
		readonly connectionId: string,
	) {
		super();
	}
}
