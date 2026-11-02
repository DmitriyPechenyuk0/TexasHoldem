import { Command } from "@nestjs/cqrs";

/**
 * An admin closes a table whatever is going on at it: a running hand is called off with every chip
 * given back, and everyone leaves.
 */
export class ForceCloseTableCommand extends Command<void> {
	constructor(
		readonly adminId: string,
		readonly tableId: string,
	) {
		super();
	}
}
