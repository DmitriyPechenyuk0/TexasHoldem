import type { Chips, HandPositions, SeatIndex } from "@holdem/engine";
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
	/**
	 * A hand starts in its own stream, `hand-<handId>`. Comes after a `PlayerStatusChanged`
	 * to `active` for every player dealt in who was waiting for the big blind.
	 */
	| {
			readonly type: "HandScheduled";
			readonly v: 1;
			readonly handId: string;
			readonly buttonSeat: SeatIndex;
			readonly smallBlindSeat: SeatIndex;
			readonly bigBlindSeat: SeatIndex;
			/** The seats dealt in, in seat order. */
			readonly seats: HandPositions["dealtIn"];
	  }
	/** A player is to act: their turn time runs from `startedAt` (epoch ms), then their time bank. */
	| {
			readonly type: "TurnStarted";
			readonly v: 1;
			readonly handId: string;
			readonly seat: SeatIndex;
			readonly startedAt: number;
	  }
	/** The player took longer than the turn time, and the overrun came out of their time bank. */
	| {
			readonly type: "TimeBankUsed";
			readonly v: 1;
			readonly seat: SeatIndex;
			readonly usedMs: number;
			readonly remainingMs: number;
	  }
	/** The hand ended: every player dealt in now has the stack it ended with. */
	| {
			readonly type: "HandSettled";
			readonly v: 1;
			readonly handId: string;
			readonly stacks: readonly {
				readonly seat: SeatIndex;
				readonly stack: Chips;
			}[];
	  }
	/** Comes after a `SeatLeft` for every player and a `SpectatorLeft` for every spectator. */
	| { readonly type: "TableClosed"; readonly v: 1 };

export type TableEventType = TableEvent["type"];
