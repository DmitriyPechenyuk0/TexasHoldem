import type { Chips, HandPositions, SeatIndex } from "@holdem/engine";
import type { TableConfig } from "./table-config.js";

/**
 * - `waiting-for-big-blind`: seated, dealt in once the big blind reaches the seat (RULES §4), so
 *   nobody plays a hand without paying for it;
 * - `active`: dealt into every hand;
 * - `sitting-out`: keeps the seat but is not dealt in;
 * - `leaving`: left during a hand they are dealt into, and keeps the seat until it ends.
 */
export type SeatStatus =
	"waiting-for-big-blind" | "active" | "sitting-out" | "leaving";

export interface SeatedPlayer {
	readonly seat: SeatIndex;
	readonly userId: string;
	readonly stack: Chips;
	readonly status: SeatStatus;
}

/** The hand being played: set by `HandScheduled`, cleared by `HandSettled`. */
export interface CurrentHand {
	readonly handId: string;
	/** The seats dealt in. */
	readonly seats: readonly SeatIndex[];
}

export interface UnopenedTable {
	readonly status: "unopened";
}

export interface OpenedTable {
	readonly status: "open" | "closed";
	readonly tableId: string;
	readonly config: TableConfig;
	/** In seat order. */
	readonly players: readonly SeatedPlayer[];
	/** User ids, in the order they started watching. */
	readonly spectators: readonly string[];
	readonly hand: CurrentHand | null;
	/** Where the button and the blinds were in the last hand, for the next one; null before the first. */
	readonly positions: Pick<
		HandPositions,
		"buttonSeat" | "smallBlindSeat" | "bigBlindSeat"
	> | null;
}

export type TableState = UnopenedTable | OpenedTable;

export const initialTableState: TableState = { status: "unopened" };

/** At most this many users watch one table, so a public table cannot be flooded. */
export const MAX_SPECTATORS = 50;
