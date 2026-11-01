import type { Relation } from "@holdem/shared/contracts/social";
import { Query } from "@nestjs/cqrs";
import type { PlayerCard } from "@/shared/application/player-directory.js";

export interface PlayerMatch extends PlayerCard {
	readonly relation: Relation;
}

/** At most this many players are found. */
export const LOOK_UP_LIMIT = 10;

/**
 * Players whose username starts with `prefix`, without the player searching, each with where the
 * player stands with them.
 */
export class LookUpPlayersQuery extends Query<readonly PlayerMatch[]> {
	constructor(
		readonly userId: string,
		readonly prefix: string,
	) {
		super();
	}
}
