import type { Standing } from "./friendship.js";

/** The friendships and requests of the players a unit of work locked; see `FriendshipRepository`. */
export interface Friendships {
	/** Where the two stand, seen from `me`. */
	standing(me: string, them: string): Promise<Standing>;

	addRequest(fromId: string, toId: string, at: Date): Promise<void>;

	removeRequest(fromId: string, toId: string): Promise<void>;

	/** Makes the two friends since `at`, and drops their requests to each other. */
	befriend(a: string, b: string, at: Date): Promise<void>;

	unfriend(a: string, b: string): Promise<void>;
}

export abstract class FriendshipRepository {
	/**
	 * Runs `work` in one transaction, with the players given locked: changes that involve any of
	 * them wait until it ends. Their counts hold for its length, so two requests at once cannot
	 * both slip under a limit, and two players asking each other at once become friends once.
	 */
	abstract locked<T>(
		userIds: readonly string[],
		work: (friendships: Friendships) => Promise<T>,
	): Promise<T>;
}
