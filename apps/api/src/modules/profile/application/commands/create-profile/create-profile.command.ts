import type { Locale, UserId } from "@holdem/shared";
import { Command } from "@nestjs/cqrs";

/** Creates a new account's profile; does nothing when it already exists. */
export class CreateProfileCommand extends Command<void> {
	constructor(
		readonly userId: UserId,
		readonly username: string,
		readonly locale: Locale,
	) {
		super();
	}
}
