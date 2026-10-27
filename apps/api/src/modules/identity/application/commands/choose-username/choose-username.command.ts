import type { UserId } from "@holdem/shared";
import { Command } from "@nestjs/cqrs";

/**
 * Gives an account an OAuth sign-in created without a username its username, in any case; it is
 * stored in lowercase, like every username.
 */
export class ChooseUsernameCommand extends Command<void> {
	constructor(
		readonly userId: UserId,
		readonly username: string,
	) {
		super();
	}
}
