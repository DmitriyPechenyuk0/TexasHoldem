import type { GameEvents, GameState } from "../../domain/game.js";

/**
 * A table took a command: its new events and state, published in this process in the order the
 * table took them. The gateway sends each viewer their redacted part (POK-82, POK-83). Hand events
 * carry the deck: never send them, or `state.hand`, to a client as they are.
 */
export class TableChanged {
	constructor(
		readonly tableId: string,
		/** The table stream's version after the events. */
		readonly tableVersion: number,
		readonly events: GameEvents,
		readonly state: GameState,
	) {}
}
