import { Query } from "@nestjs/cqrs";
import type { Presence } from "../../../domain/presence.js";

export interface FriendPresence {
	readonly userId: string;
	readonly presence: Presence;
}

/** Where each of the player's friends is, as the player may see it. */
export class GetFriendsPresenceQuery extends Query<readonly FriendPresence[]> {
	constructor(readonly userId: string) {
		super();
	}
}
