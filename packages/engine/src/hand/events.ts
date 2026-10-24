import type { Card } from "../cards/index.js";
import type { Chips, HandPlayer, SeatIndex } from "./config.js";

// Every event is plain JSON: a `type`, a schema version `v`, and data. A schema change bumps `v`
// and adds an upcaster; stored events are never rewritten.

export type Street = "preflop" | "flop" | "turn" | "river";

/** What a player did; `amount` is the chips this action added, 0 for a fold or check. */
export type ActedKind = "fold" | "check" | "call" | "bet" | "raise";

export interface Pot {
	readonly amount: Chips;
	/** Seats still in the hand that can win it. */
	readonly eligibleSeats: readonly SeatIndex[];
}

export type HandEvent =
	| {
			readonly type: "HandStarted";
			readonly v: 1;
			readonly handId: string;
			readonly smallBlind: Chips;
			readonly bigBlind: Chips;
			readonly ante: Chips;
			readonly buttonSeat: SeatIndex;
			readonly smallBlindSeat: SeatIndex;
			readonly bigBlindSeat: SeatIndex;
			readonly players: readonly HandPlayer[];
			/** The full deck order. Never shown to players before the hand ends. */
			readonly deck: readonly Card[];
	  }
	| {
			readonly type: "AntePosted";
			readonly v: 1;
			readonly seat: SeatIndex;
			readonly amount: Chips;
			readonly allIn: boolean;
	  }
	| {
			readonly type: "BlindPosted";
			readonly v: 1;
			readonly seat: SeatIndex;
			readonly blind: "small" | "big";
			readonly amount: Chips;
			readonly allIn: boolean;
	  }
	| {
			readonly type: "HoleCardsDealt";
			readonly v: 1;
			/** In dealing order; each player's two cards. */
			readonly hands: readonly {
				readonly seat: SeatIndex;
				readonly cards: readonly [Card, Card];
			}[];
	  }
	| {
			readonly type: "PlayerActed";
			readonly v: 1;
			readonly seat: SeatIndex;
			readonly action: ActedKind;
			readonly amount: Chips;
			readonly allIn: boolean;
			/** Set when the turn timer acted for the player (POK-54); absent otherwise. */
			readonly auto?: true;
	  }
	| {
			readonly type: "StreetDealt";
			readonly v: 1;
			readonly street: Exclude<Street, "preflop">;
			readonly burn: Card;
			readonly cards: readonly Card[];
	  }
	/** The part of a bet nobody could call goes back to the bettor (RULES §9). */
	| {
			readonly type: "UncalledBetReturned";
			readonly v: 1;
			readonly seat: SeatIndex;
			readonly amount: Chips;
	  }
	/**
	 * Betting is over and two or more players remain: cards are shown or mucked in turn (RULES §10).
	 * Hands that can win are turned up on their own; a player who can only lose shows or mucks.
	 */
	| { readonly type: "ShowdownStarted"; readonly v: 1 }
	/**
	 * The bets of a finished round move into the pots; the list replaces the previous one. Only when
	 * the pots change: new chips, or a fold that changes who can win. A checked round adds nothing.
	 */
	| {
			readonly type: "PotsCollected";
			readonly v: 1;
			readonly pots: readonly Pot[];
	  }
	| {
			readonly type: "CardsShown";
			readonly v: 1;
			readonly seat: SeatIndex;
			readonly cards: readonly [Card, Card];
	  }
	| {
			readonly type: "CardsMucked";
			readonly v: 1;
			readonly seat: SeatIndex;
			/** Set when the turn timer mucked for the player (POK-54); absent otherwise. */
			readonly auto?: true;
	  }
	| {
			readonly type: "PotAwarded";
			readonly v: 1;
			/** Index into the collected pots. */
			readonly pot: number;
			readonly winners: readonly {
				readonly seat: SeatIndex;
				readonly amount: Chips;
			}[];
	  }
	| {
			readonly type: "HandEnded";
			readonly v: 1;
			/** Every player's stack after the hand, for the table to settle. */
			readonly stacks: readonly {
				readonly seat: SeatIndex;
				readonly stack: Chips;
			}[];
	  };

export type HandEventType = HandEvent["type"];
