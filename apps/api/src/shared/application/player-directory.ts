import { Query } from "@nestjs/cqrs";

/** How a player is shown to others: the handle, the display name and the avatar. */
export interface PlayerCard {
	readonly userId: string;
	/** Lowercase, unique, never changes. */
	readonly username: string;
	readonly nickname: string;
	readonly avatarUrl: string | null;
}

// Who the players are, asked by contexts that list them (social) and answered by the profile
// context. In the shared kernel, so they ask without knowing who answers.

/** The cards of these players, in no particular order; an unknown id has none. */
export class GetPlayerCardsQuery extends Query<readonly PlayerCard[]> {
	constructor(readonly userIds: readonly string[]) {
		super();
	}
}

/** The player with this username, in any case; null for none. */
export class FindPlayerQuery extends Query<PlayerCard | null> {
	constructor(readonly username: string) {
		super();
	}
}

/** Up to `limit` players whose username starts with `prefix`, in any case, by username. */
export class SearchPlayersQuery extends Query<readonly PlayerCard[]> {
	constructor(
		readonly prefix: string,
		readonly limit: number,
		readonly excludeUserId: string,
	) {
		super();
	}
}
