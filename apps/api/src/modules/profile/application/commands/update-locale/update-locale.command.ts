import type { Locale, UserId } from "@holdem/shared";
import { Command } from "@nestjs/cqrs";

/** The language of the interface and of the player's emails. */
export class UpdateLocaleCommand extends Command<void> {
	constructor(
		readonly userId: UserId,
		readonly locale: Locale,
	) {
		super();
	}
}
