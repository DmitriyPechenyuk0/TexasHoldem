import type { Locale, UserId } from "@holdem/shared";
import { Command } from "@nestjs/cqrs";

/** Sets the language of the user's emails. Profile sends it when the player picks a language. */
export class SetEmailLocaleCommand extends Command<void> {
	constructor(
		readonly userId: UserId,
		readonly locale: Locale,
	) {
		super();
	}
}
