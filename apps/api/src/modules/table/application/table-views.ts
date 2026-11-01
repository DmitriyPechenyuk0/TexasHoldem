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
	TurnTimer,
} from "@holdem/shared/realtime";
import type { GameEvents, GameState } from "../domain/game.js";
import { TableNotOpenError } from "../domain/table-errors.js";
import type { OpenedTable, TableState } from "../domain/table-state.js";

/** How a user sees the table: from their seat if they have one, otherwise as a spectator. */
export function viewerAt(table: OpenedTable, userId: string): Viewer {
	return (
		table.players.find((player) => player.userId === userId)?.seat ??
		"spectator"
	);
}

/**
 * The running turn's clock, in absolute server time: the turn time ends at `turnEndsAt`, and the
 * player's time bank runs on after it. Null while nobody is to act.
 */
export function turnTimerOf(table: TableState): TurnTimer | null {
	if (table.status !== "open" || !table.turn) {
		return null;
	}
	const { handId, seat, startedAt } = table.turn;
	const player = table.players.find((candidate) => candidate.seat === seat);
	return {
		handId,
		seat,
		turnEndsAt: new Date(
			startedAt + table.config.turnSeconds * 1000,
		).toISOString(),
		timeBankMs: player?.timeBankMs ?? 0,
	};
}

/**
 * Everything this viewer may see of the table (ADR-002): the hand through the engine's
 * `toPlayerView`, so never the deck or a hole card they may not see. `now` is the server's clock,
 * for the client to correct its timers by.
 */
export function tableViewFor(
	state: GameState,
	versions: TableVersions,
	viewer: Viewer,
	now: Date,
): TableView {
	const { table } = state;
	if (table.status === "unopened") {
		throw new TableNotOpenError();
	}
	return {
		tableId: table.tableId as TableView["tableId"],
		versions,
		serverTime: now.toISOString(),
		status: table.status,
		settings: table.config,
		seats: table.players.map(({ seat, userId, stack, status, timeBankMs }) => ({
			seat,
			userId,
			stack,
			status,
			timeBankMs,
		})),
		spectatorCount: table.spectators.length,
		hand: toPlayerView(state.hand, viewer),
		timer: turnTimerOf(table),
		fairness: table.deck && {
			handId: table.deck.handId,
			serverSeedHash: table.deck.commitment,
		},
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
