import type { HandCommandType } from "./commands.js";
import type { SeatIndex } from "./config.js";

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
