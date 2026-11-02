import { Query } from "@nestjs/cqrs";
import type { Presence } from "../../../domain/presence.js";

/** A friend online, to be told the player's presence as they may see it. */
export interface PresenceWatcher {
	readonly viewerId: string;
	readonly presence: Presence;
}

/** The player's friends who are online, each with the player's presence as they may see it. */
export class GetPresenceWatchersQuery extends Query<
	readonly PresenceWatcher[]
> {
	constructor(readonly userId: string) {
		super();
	}
}
