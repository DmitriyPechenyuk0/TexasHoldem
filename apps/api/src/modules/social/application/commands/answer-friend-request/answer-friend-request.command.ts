import { Command } from "@nestjs/cqrs";

/** The player asked accepts the request from `fromId`, or declines it without telling them. */
export class AnswerFriendRequestCommand extends Command<void> {
	constructor(
		readonly userId: string,
		readonly fromId: string,
		readonly answer: "accept" | "decline",
	) {
		super();
	}
}
