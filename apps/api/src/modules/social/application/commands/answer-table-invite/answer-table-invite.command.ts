import { Command } from "@nestjs/cqrs";

/**
 * The player accepts a friend's invite to a table, or declines it without telling them. Answers
 * the table to go to.
 */
export class AnswerTableInviteCommand extends Command<string> {
	constructor(
		readonly userId: string,
		readonly inviterId: string,
		readonly tableId: string,
		readonly answer: "accept" | "decline",
	) {
		super();
	}
}
