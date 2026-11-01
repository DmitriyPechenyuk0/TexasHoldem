import type { TableVersions } from "@holdem/shared/realtime";
import type { GameEvents, GameState } from "../../domain/game.js";

/**
 * A table took a command: its new events and state, published in this process in the order the
 * table took them. The gateway sends each viewer their redacted part. Hand events carry the deck:
 * never send them, or `state.hand`, to a client as they are.
 */
export class TableChanged {
	constructor(
		readonly tableId: string,
		/** Where the table's streams are after the events, as clients follow them. */
		readonly versions: TableVersions,
		readonly events: GameEvents,
		readonly state: GameState,
	) {}
}
