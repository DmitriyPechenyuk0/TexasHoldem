import { Command } from "@nestjs/cqrs";

/** A player invites a friend to a table they may join themselves. */
export class InviteFriendToTableCommand extends Command<void> {
	constructor(
		readonly userId: string,
		readonly friendId: string,
		readonly tableId: string,
	) {
		super();
	}
}
