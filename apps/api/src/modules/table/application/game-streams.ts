import {
	evolve as evolveHand,
	type HandEvent,
	initialHandState,
} from "@holdem/engine";
import type {
	EventMetadata,
	EventStore,
} from "@/shared/application/event-store.js";
import { loadDecider } from "@/shared/application/event-sourcing.js";
import { evolveTable } from "../domain/evolve-table.js";
import { evolveGame, type GameEvents, type GameState } from "../domain/game.js";
import type { TableEvent } from "../domain/table-events.js";
import { initialTableState } from "../domain/table-state.js";

/** The table context's store holds both kinds of stream: `table-<id>` and `hand-<id>`. */
export type TableStreamEvent = TableEvent | HandEvent;

export const tableStream = (tableId: string): string => `table-${tableId}`;
export const handStream = (handId: string): string => `hand-${handId}`;

/** A table and its current hand, with the versions the next append expects. */
export interface LoadedGame {
	readonly tableId: string;
	readonly state: GameState;
	readonly tableVersion: number;
	/** The hand stream that commands go to, while one is being played. */
	readonly handId: string | null;
	readonly handVersion: number;
}

// One store, read with the events of each kind of stream.
const tableEvents = (store: EventStore<TableStreamEvent>) =>
	store as unknown as EventStore<TableEvent>;
const handEvents = (store: EventStore<TableStreamEvent>) =>
	store as unknown as EventStore<HandEvent>;

/** Folds the table's stream, and the stream of the hand it is playing, if any. */
export async function loadGame(
	store: EventStore<TableStreamEvent>,
	tableId: string,
): Promise<LoadedGame> {
	const table = await loadDecider(
		tableEvents(store),
		{ evolve: evolveTable, initialState: initialTableState },
		tableStream(tableId),
	);
	const handId =
		table.state.status === "unopened"
			? null
			: (table.state.hand?.handId ?? null);
	const hand = handId
		? await loadDecider(
				handEvents(store),
				{ evolve: evolveHand, initialState: initialHandState },
				handStream(handId),
			)
		: { state: initialHandState, version: 0 };
	return {
		tableId,
		state: { table: table.state, hand: hand.state },
		tableVersion: table.version,
		handId,
		handVersion: hand.version,
	};
}

/**
 * Appends a decision to the table's stream and its hand's, both or neither, and answers the game
 * after it. A hand that starts gets a stream of its own. Throws `ConcurrencyError` when another
 * command got there first.
 */
export async function saveGame(
	store: EventStore<TableStreamEvent>,
	loaded: LoadedGame,
	events: GameEvents,
	metadata?: EventMetadata,
): Promise<LoadedGame> {
	const scheduled = events.table.find(
		(event) => event.type === "HandScheduled",
	);
	const handId = scheduled?.handId ?? loaded.handId;
	const handVersion = scheduled ? 0 : loaded.handVersion;
	if (events.hand.length > 0 && !handId) {
		throw new Error(`Hand events for table ${loaded.tableId} without a hand`);
	}
	const [tableVersion = loaded.tableVersion, newHandVersion = handVersion] =
		await store.appendToStreams(
			[
				{
					streamId: tableStream(loaded.tableId),
					expectedVersion: loaded.tableVersion,
					events: events.table,
				},
				...(handId
					? [
							{
								streamId: handStream(handId),
								expectedVersion: handVersion,
								events: events.hand,
							},
						]
					: []),
			],
			metadata,
		);
	const state = evolveGame(loaded.state, events);
	const playing =
		state.table.status === "unopened"
			? null
			: (state.table.hand?.handId ?? null);
	return {
		tableId: loaded.tableId,
		state,
		tableVersion,
		handId: playing,
		handVersion: playing ? newHandVersion : 0,
	};
}
