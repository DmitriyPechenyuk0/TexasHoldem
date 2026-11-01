import { Query } from "@nestjs/cqrs";
import type { PlayerCard } from "@/shared/application/player-directory.js";

export interface MutedPlayer extends PlayerCard {
	readonly mutedAt: Date;
}

/** Whom the player muted, latest first, as cards for managing the list. */
export class GetMutesQuery extends Query<readonly MutedPlayer[]> {
	constructor(readonly userId: string) {
		super();
	}
}
