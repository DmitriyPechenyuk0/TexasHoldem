import { Command } from "@nestjs/cqrs";

/** The player stops being friends with `friendId`, for both of them. */
export class RemoveFriendCommand extends Command<void> {
	constructor(
		readonly userId: string,
		readonly friendId: string,
	) {
		super();
	}
}
