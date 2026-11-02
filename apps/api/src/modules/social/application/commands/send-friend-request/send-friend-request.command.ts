import { Command } from "@nestjs/cqrs";
import type { RequestOutcome } from "../../../domain/friendship.js";

export interface SentFriendRequest {
	readonly userId: string;
	readonly outcome: RequestOutcome;
}

/** A player asks the one with this username, in any case, to be friends. */
export class SendFriendRequestCommand extends Command<SentFriendRequest> {
	constructor(
		readonly userId: string,
		readonly toUsername: string,
	) {
		super();
	}
}
