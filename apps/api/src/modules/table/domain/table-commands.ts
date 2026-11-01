import type { Chips, SeatIndex } from "@holdem/engine";
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
