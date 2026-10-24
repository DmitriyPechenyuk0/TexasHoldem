import type { Card } from "../cards/index.js";

/** An amount of chips: a non-negative integer. Chips are never fractional. */
export type Chips = number;

/** A numbered position at the table, from 0. Play moves clockwise, towards higher seats. */
export type SeatIndex = number;

export interface HandPlayer {
	readonly seat: SeatIndex;
	readonly playerId: string;
	/** Chips in front of the player when the hand starts. */
	readonly stack: Chips;
}

/** Everything a hand needs to start; the table decides it (POK-75). */
export interface HandConfig {
	readonly handId: string;
	readonly smallBlind: Chips;
	readonly bigBlind: Chips;
	/** 0 for cash games. */
	readonly ante: Chips;
	/** May be an empty seat under the dead button rule (RULES §4). */
	readonly buttonSeat: SeatIndex;
	/**
	 * Where the small blind sits. An empty seat means a dead small blind: nobody posts it this hand
	 * (RULES §4). Heads-up it is the button (TDA 34-B).
	 */
	readonly smallBlindSeat: SeatIndex;
	/** A player dealt in; the big blind moves forward exactly one seat each hand (RULES §4). */
	readonly bigBlindSeat: SeatIndex;
	/** The players dealt in, each with chips. */
	readonly players: readonly HandPlayer[];
	/** The shuffled deck (POK-45); cards are dealt from position 0. */
	readonly deck: readonly Card[];
}

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 10;
