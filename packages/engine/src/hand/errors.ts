import type { HandCommandType } from "./commands.js";
import type { Chips, SeatIndex } from "./config.js";

/** Which part of a `HandConfig` is wrong. */
export type InvalidConfigReason =
	| "player-count"
	| "seats"
	| "player-ids"
	| "stacks"
	| "blinds"
	| "ante"
	| "button"
	| "deck";

/**
 * Why a command was rejected. `code` is stable: clients translate it, with `params` filled in,
 * like the api's problem codes.
 */
export type HandError =
	| {
			readonly code: "hand.not-started";
			readonly params: { readonly command: HandCommandType };
	  }
	| { readonly code: "hand.already-started" }
	| { readonly code: "hand.over" }
	| {
			readonly code: "hand.invalid-config";
			readonly params: { readonly reason: InvalidConfigReason };
	  }
	| {
			readonly code: "hand.not-your-turn";
			readonly params: { readonly seat: SeatIndex };
	  }
	/** Facing a bet: call, raise or fold instead. */
	| {
			readonly code: "hand.illegal-check";
			readonly params: { readonly callAmount: Chips };
	  }
	| { readonly code: "hand.nothing-to-call" }
	/** Somebody already bet on this street: raise instead. */
	| { readonly code: "hand.illegal-bet" }
	/** Nobody has bet on this street: bet instead. */
	| { readonly code: "hand.illegal-raise" }
	/** Every opponent is all-in or folded, or the stack does not cover more than the call. */
	| { readonly code: "hand.raise-not-allowed" }
	/** A short all-in did not reopen the betting for a player who already acted: call or fold (TDA 47). */
	| { readonly code: "hand.betting-not-reopened" }
	/** A bet or raise needs a whole number of chips as its total. */
	| { readonly code: "hand.invalid-amount" }
	| {
			readonly code: "hand.bet-too-small";
			readonly params: { readonly minTo: Chips };
	  }
	| {
			readonly code: "hand.raise-too-small";
			readonly params: { readonly minTo: Chips };
	  }
	| {
			readonly code: "hand.insufficient-chips";
			readonly params: { readonly maxTo: Chips };
	  }
	/** The hand is at the showdown: only showing or mucking cards is left. */
	| { readonly code: "hand.betting-over" }
	| {
			readonly code: "hand.showdown-not-reached";
			readonly params: { readonly seat: SeatIndex };
	  }
	/** Not dealt in, folded, or already mucked. */
	| {
			readonly code: "hand.player-not-in-hand";
			readonly params: { readonly seat: SeatIndex };
	  }
	| {
			readonly code: "hand.cards-already-shown";
			readonly params: { readonly seat: SeatIndex };
	  };

export type HandErrorCode = HandError["code"];
