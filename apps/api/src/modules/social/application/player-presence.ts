import type { Whereabouts } from "../domain/presence.js";

/**
 * Port for where players are, across every api instance (POK-105). A player is shown online from
 * their first connection on `/social` until `settle` finds none left, which is called a few
 * seconds after their last one closes. A connection whose instance stopped without closing it is
 * forgotten after a while. Where they sit comes from the tables' summaries.
 */
export abstract class PlayerPresence {
	/** Records a connection; true when it shows the player online, who was not shown so. */
	abstract connect(userId: string, connectionId: string): Promise<boolean>;

	abstract disconnect(userId: string, connectionId: string): Promise<void>;

	/** Shows the player offline if no connection of theirs is left; true when it did. */
	abstract settle(userId: string): Promise<boolean>;

	/** The players shown online, to settle those whose instance stopped. */
	abstract shownOnline(): Promise<readonly string[]>;

	/** Who sits at the table now (nobody once it closed); answers the players who sat down or left. */
	abstract seat(
		tableId: string,
		userIds: readonly string[],
	): Promise<readonly string[]>;

	/** Where each of these players is. */
	abstract whereabouts(
		userIds: readonly string[],
	): Promise<ReadonlyMap<string, Whereabouts>>;
}
