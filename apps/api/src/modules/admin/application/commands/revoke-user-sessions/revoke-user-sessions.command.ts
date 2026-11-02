import { Command } from "@nestjs/cqrs";

/** An admin signs a user out everywhere; answers how many sessions ended. */
export class RevokeUserSessionsCommand extends Command<number> {
	constructor(
		readonly adminId: string,
		readonly userId: string,
	) {
		super();
	}
}
