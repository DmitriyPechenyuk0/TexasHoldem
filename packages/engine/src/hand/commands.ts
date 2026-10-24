import type { Chips, HandConfig, SeatIndex } from "./config.js";

/** What a player can choose to do on their turn (RULES §7). */
export type ActionKind = "fold" | "check" | "call" | "bet" | "raise" | "all-in";

export type HandCommand =
	| { readonly type: "StartHand"; readonly config: HandConfig }
	| {
			readonly type: "Act";
			readonly seat: SeatIndex;
			readonly action: ActionKind;
			/** For a bet or raise: the player's total bet on this street afterwards ("raise to"). */
			readonly amount?: Chips;
	  }
	/** The turn timer ran out: the player checks if they can, otherwise folds. */
	| { readonly type: "Timeout"; readonly seat: SeatIndex }
	| { readonly type: "ShowCards"; readonly seat: SeatIndex }
	| { readonly type: "MuckCards"; readonly seat: SeatIndex };

export type HandCommandType = HandCommand["type"];
