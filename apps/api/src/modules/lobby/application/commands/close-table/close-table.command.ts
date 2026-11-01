import { Command } from "@nestjs/cqrs";

/** The creator closes their table, once nobody sits at it. */
export class CloseTableCommand extends Command<void> {
	constructor(
		readonly tableId: string,
		readonly userId: string,
	) {
		super();
	}
}
