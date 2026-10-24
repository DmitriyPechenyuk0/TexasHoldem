import type { Card } from "../cards/index.js";
import type { Chips, SeatIndex } from "./config.js";
import type { Pot, Street } from "./events.js";

export interface PlayerState {
	readonly seat: SeatIndex;
	readonly playerId: string;
	/** Chips still behind, not in the middle. */
	readonly stack: Chips;
	/** Chips put in on the current street, not yet collected into a pot. */
	readonly bet: Chips;
	/** Every chip put in this hand: antes, blinds and bets, collected or not. */
	readonly committed: Chips;
	readonly holeCards: readonly [Card, Card] | null;
	readonly folded: boolean;
	readonly allIn: boolean;
	readonly shown: boolean;
	readonly mucked: boolean;
}

export interface PotState extends Pot {
	readonly awarded: boolean;
}

export interface IdleHand {
	readonly status: "idle";
}

export interface ActiveHand {
	readonly status: "in-progress" | "ended";
	readonly handId: string;
	readonly smallBlind: Chips;
	readonly bigBlind: Chips;
	readonly ante: Chips;
	readonly buttonSeat: SeatIndex;
	/** In seat order, which is clockwise. */
	readonly players: readonly PlayerState[];
	readonly deck: readonly Card[];
	/** Position in the deck of the next card to deal; every card comes from the top (POK-45). */
	readonly nextCard: number;
	readonly board: readonly Card[];
	readonly street: Street | "showdown";
	/** Whose turn it is, or null between betting rounds. */
	readonly toAct: SeatIndex | null;
	/** The highest bet on this street. */
	readonly currentBet: Chips;
	/** The last full bet or raise increment on this street (RULES §8); starts at the big blind. */
	readonly minRaise: Chips;
	/** The last player to bet or raise on this street. */
	readonly lastAggressor: SeatIndex | null;
	readonly pots: readonly PotState[];
}

export type HandState = IdleHand | ActiveHand;

export const initialHandState: HandState = { status: "idle" };
