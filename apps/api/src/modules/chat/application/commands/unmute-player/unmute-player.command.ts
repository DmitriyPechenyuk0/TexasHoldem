import { Command } from "@nestjs/cqrs";

/** The player sees `mutedId`'s messages again; unmuting someone not muted changes nothing. */
export class UnmutePlayerCommand extends Command<void> {
	constructor(
		readonly userId: string,
		readonly mutedId: string,
	) {
		super();
	}
}
