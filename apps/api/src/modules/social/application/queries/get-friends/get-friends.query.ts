import { Query } from "@nestjs/cqrs";
import type { PlayerCard } from "@/shared/application/player-directory.js";

export interface Friend extends PlayerCard {
	readonly since: Date;
}

/** The player's friends, by nickname. */
export class GetFriendsQuery extends Query<readonly Friend[]> {
	constructor(readonly userId: string) {
		super();
	}
}
