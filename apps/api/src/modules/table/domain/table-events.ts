import type { Chips, SeatIndex } from "@holdem/engine";
import type { TableConfig } from "./table-config.js";
import type { SeatStatus } from "./table-state.js";

// Like hand events (packages/engine), every event is plain JSON: a `type`, a schema version `v`,
// and data. A schema change bumps `v` and adds an upcaster; stored events are never rewritten.

export type TableEvent =
	| {
			readonly type: "TableOpened";
			readonly v: 1;
			readonly tableId: string;
			readonly config: TableConfig;
	  }
	/** The player starts out waiting for the big blind. */
	| {
			readonly type: "SeatTaken";
			readonly v: 1;
			readonly seat: SeatIndex;
			readonly userId: string;
			readonly buyIn: Chips;
	  }
	| {
			readonly type: "SeatLeft";
			readonly v: 1;
			readonly seat: SeatIndex;
			readonly userId: string;
	  }
	| {
			readonly type: "PlayerStatusChanged";
			readonly v: 1;
			readonly seat: SeatIndex;
			readonly status: SeatStatus;
	  }
	| {
			readonly type: "ChipsAdded";
			readonly v: 1;
			readonly seat: SeatIndex;
			readonly amount: Chips;
			readonly reason: "rebuy" | "top-up";
	  }
	| { readonly type: "SpectatorJoined"; readonly v: 1; readonly userId: string }
	| { readonly type: "SpectatorLeft"; readonly v: 1; readonly userId: string }
	/** Comes after a `SeatLeft` for every player and a `SpectatorLeft` for every spectator. */
	| { readonly type: "TableClosed"; readonly v: 1 };

export type TableEventType = TableEvent["type"];
