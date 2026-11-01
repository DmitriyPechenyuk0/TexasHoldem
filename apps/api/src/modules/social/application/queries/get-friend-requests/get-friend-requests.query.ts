import { Query } from "@nestjs/cqrs";
import type { PlayerCard } from "@/shared/application/player-directory.js";

/** A request waiting for an answer, with the card of the other player. */
export interface PendingRequest extends PlayerCard {
	readonly sentAt: Date;
}

/** The requests sent to the player (`incoming`), or by them (`outgoing`), newest first. */
export class GetFriendRequestsQuery extends Query<readonly PendingRequest[]> {
	constructor(
		readonly userId: string,
		readonly direction: "incoming" | "outgoing",
	) {
		super();
	}
}
