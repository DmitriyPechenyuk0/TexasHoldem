import { Command } from "@nestjs/cqrs";

/** The player takes back the request they sent `toId`. */
export class CancelFriendRequestCommand extends Command<void> {
	constructor(
		readonly userId: string,
		readonly toId: string,
	) {
		super();
	}
}
