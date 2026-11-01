import {
	type HandEvent,
	redactEvent,
	toPlayerView,
	type Viewer,
} from "@holdem/engine";
import type {
	TableEventsBatch,
	TableVersions,
	TableView,
} from "@holdem/shared/realtime";
import type { GameEvents, GameState } from "../domain/game.js";
import { TableNotOpenError } from "../domain/table-errors.js";
import type { OpenedTable } from "../domain/table-state.js";

/** How a user sees the table: from their seat if they have one, otherwise as a spectator. */
export function viewerAt(table: OpenedTable, userId: string): Viewer {
	return (
		table.players.find((player) => player.userId === userId)?.seat ??
		"spectator"
	);
}

/**
 * Everything this viewer may see of the table (ADR-002): the hand through the engine's
 * `toPlayerView`, so never the deck or a hole card they may not see.
 */
export function tableViewFor(
	state: GameState,
	versions: TableVersions,
	viewer: Viewer,
): TableView {
	const { table } = state;
	if (table.status === "unopened") {
		throw new TableNotOpenError();
	}
	return {
		tableId: table.tableId as TableView["tableId"],
		versions,
		status: table.status,
		settings: table.config,
		seats: table.players.map(({ seat, userId, stack, status }) => ({
			seat,
			userId,
			stack,
			status,
		})),
		spectatorCount: table.spectators.length,
		hand: toPlayerView(state.hand, viewer),
		// The turn clock and the seed commitment come with POK-84 and POK-86.
		timer: null,
		fairness: null,
	};
}

/** One command's events as this viewer may see them: hand events through `redactEvent`. */
export function eventsBatchFor(
	tableId: string,
	versions: TableVersions,
	events: GameEvents,
	viewer: Viewer,
): TableEventsBatch {
	return {
		tableId: tableId as TableEventsBatch["tableId"],
		versions,
		table: events.table,
		hand: events.hand.map((event: HandEvent) => redactEvent(event, viewer)),
	};
}
