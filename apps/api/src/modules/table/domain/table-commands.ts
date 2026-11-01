import type { ActionKind, Card, Chips, SeatIndex } from "@holdem/engine";
import type { TableConfig } from "./table-config.js";

/** Every command but `OpenTable` and `CloseTable` comes from a user, who is identified by id. */
export type TableCommand =
	| {
			readonly type: "OpenTable";
			readonly tableId: string;
			readonly config: TableConfig;
	  }
	| {
			readonly type: "TakeSeat";
			readonly userId: string;
			/** Only a user with a verified email plays (POK-62). */
			readonly verified: boolean;
			readonly seat: SeatIndex;
			readonly buyIn: Chips;
	  }
	/** Frees the seat; a player dealt into the running hand keeps it until the hand ends. */
	| { readonly type: "LeaveSeat"; readonly userId: string }
	| { readonly type: "SitOut"; readonly userId: string }
	| { readonly type: "SitIn"; readonly userId: string }
	/** A new buy-in for a player who has lost their stack. */
	| { readonly type: "Rebuy"; readonly userId: string; readonly amount: Chips }
	/** More chips for a player who still has some, up to the maximum buy-in. */
	| { readonly type: "TopUp"; readonly userId: string; readonly amount: Chips }
	| { readonly type: "JoinAsSpectator"; readonly userId: string }
	| { readonly type: "LeaveSpectating"; readonly userId: string }
	| { readonly type: "CloseTable" };

export type TableCommandType = TableCommand["type"];

/** Commands that run hands. The table maps a user to their seat in the hand. */
export type HandPlayCommand =
	/**
	 * Deals the next hand, when two players are ready. `buttonDraw` places the button when the table
	 * starts over: on the seat it picks among the players dealt in, modulo their number.
	 */
	| {
			readonly type: "StartHand";
			readonly handId: string;
			readonly deck: readonly Card[];
			readonly buttonDraw: number;
			/** The hex SHA-256 of the server seed the deck comes from, published before the deal. */
			readonly commitment: string;
	  }
	/** After the hand: publishes its server seed (hex), which must match the commitment (ADR-008). */
	| {
			readonly type: "RevealDeck";
			readonly handId: string;
			readonly serverSeed: string;
	  }
	| {
			readonly type: "Act";
			readonly userId: string;
			readonly action: ActionKind;
			/** For a bet or raise: the total bet on this street afterwards ("raise to"). */
			readonly amount?: Chips;
	  }
	| { readonly type: "ShowCards"; readonly userId: string }
	| { readonly type: "MuckCards"; readonly userId: string }
	/** The turn timer ran out (POK-84); `handId` keeps a late timer off the next hand. */
	| {
			readonly type: "Timeout";
			readonly handId: string;
			readonly seat: SeatIndex;
	  };

/**
 * Who is still at the table (POK-85), on the table's clock: a user's connections come and go, and
 * the table's runtime sends `ExpireAbsences` once a reconnect grace or a sit-out runs out.
 */
export type AbsenceCommand =
	/** The user's last connection to the table closed: a player keeps the seat, a spectator leaves. */
	| { readonly type: "Disconnect"; readonly userId: string }
	/** A disconnected player is back. */
	| { readonly type: "Reconnect"; readonly userId: string }
	| { readonly type: "ExpireAbsences" };

/** Everything the table accepts: seats and spectators, the hands it runs, and who is away. */
export type GameCommand = TableCommand | HandPlayCommand | AbsenceCommand;
