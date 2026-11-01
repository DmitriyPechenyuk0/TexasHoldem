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
	/**
	 * Time bank left, drawn on once a turn's time is out. Full when the player sits down, and never
	 * refilled while they keep the seat.
	 */
	readonly timeBankMs: number;
	/** When the player's last connection to the table closed (epoch ms); null while connected. */
	readonly disconnectedAt: number | null;
	/** The sit-out clock, while the player sits out (`SitOutStarted`); null otherwise. */
	readonly sitOut: SitOutClock | null;
}

/** Since when a player has sat out (epoch ms), and how many hands were dealt without them. */
export interface SitOutClock {
	readonly since: number;
	readonly handsMissed: number;
}

/** What a hand's players can check its deck with (ADR-008). */
export interface DeckFairness {
	readonly handId: string;
	readonly commitment: string;
	/** Hex; null until the hand has ended and the seed is revealed. */
	readonly serverSeed: string | null;
}

/** The turn being timed: when the player to act got it (epoch milliseconds). */
export interface TurnClock {
	readonly handId: string;
	readonly seat: SeatIndex;
	readonly startedAt: number;
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
	/** The current or last hand's deck commitment, and its server seed once revealed. */
	readonly deck: DeckFairness | null;
	/** The turn being timed while a player is to act; null otherwise. */
	readonly turn: TurnClock | null;
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
