import { Command } from "@nestjs/cqrs";

/**
 * The creator gives their private table a new invite code: the old link stops working, and
 * whoever already has access keeps it. Answers the new code.
 */
export class RegenerateInviteCommand extends Command<string> {
	constructor(
		readonly tableId: string,
		readonly userId: string,
	) {
		super();
	}
}
