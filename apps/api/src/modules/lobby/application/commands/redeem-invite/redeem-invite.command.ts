import { Command } from "@nestjs/cqrs";

/**
 * A user redeems a private table's invite, with its password if it has one, and is granted access
 * to the table. Answers the table's id.
 */
export class RedeemInviteCommand extends Command<string> {
	constructor(
		readonly code: string,
		readonly userId: string,
		readonly password?: string,
	) {
		super();
	}
}
