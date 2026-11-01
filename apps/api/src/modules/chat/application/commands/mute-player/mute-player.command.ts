import { Command } from "@nestjs/cqrs";

/** The player hides `mutedId`'s chat messages from themselves; muting twice changes nothing. */
export class MutePlayerCommand extends Command<void> {
	constructor(
		readonly userId: string,
		readonly mutedId: string,
	) {
		super();
	}
}
