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

/** A table and its current or last hand, with the versions the next append expects. */
export interface LoadedGame {
	readonly tableId: string;
	/** The table, and the hand being played or, between hands, the last one played. */
	readonly state: GameState;
	readonly tableVersion: number;
	/** The current or last hand's stream; null before the first hand. */
	readonly handId: string | null;
	readonly handVersion: number;
	/** The lease epoch of the streams' last events (ADR-004); 0 before any was fenced. */
	readonly leaseEpoch: number;
}

/** Where the streams of a loaded game are, as clients follow them (`TableVersions`). */
export const versionsOf = ({
	tableVersion,
	handId,
	handVersion,
}: LoadedGame) => ({
	tableVersion,
	hand: handId ? { handId, version: handVersion } : null,
});

// One store, read with the events of each kind of stream.
const tableEvents = (store: EventStore<TableStreamEvent>) =>
	store as unknown as EventStore<TableEvent>;
const handEvents = (store: EventStore<TableStreamEvent>) =>
	store as unknown as EventStore<HandEvent>;

/** Folds the table's stream, and the stream of its current or last hand. */
export async function loadGame(
	store: EventStore<TableStreamEvent>,
	tableId: string,
): Promise<LoadedGame> {
	const recorded = await tableEvents(store).readStream(tableStream(tableId));
	const table = recorded.reduce(
		(state, { event }) => evolveTable(state, event),
		initialTableState,
	);
	const scheduled = recorded.findLast(
		({ event }) => event.type === "HandScheduled",
	)?.event;
	const handId = scheduled?.type === "HandScheduled" ? scheduled.handId : null;
	const hand = handId
		? await loadDecider(
				handEvents(store),
				{ evolve: evolveHand, initialState: initialHandState },
				handStream(handId),
			)
		: { state: initialHandState, version: 0 };
	const handRecorded = handId
		? await handEvents(store).readStream(handStream(handId), hand.version)
		: [];
	const leaseEpoch = Math.max(
		recorded.at(-1)?.metadata.leaseEpoch ?? 0,
		handRecorded.at(-1)?.metadata.leaseEpoch ?? 0,
	);
	return {
		tableId,
		state: { table, hand: hand.state },
		tableVersion: recorded.at(-1)?.version ?? 0,
		handId,
		handVersion: hand.version,
		leaseEpoch,
	};
}

/**
 * Appends a decision to the table's stream and its hand's, both or neither, and answers the game
 * after it. A hand that starts gets a stream of its own. Throws `ConcurrencyError` when another
 * command got there first, and `FencedError` when a newer lease holder has written to them.
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
	return {
		tableId: loaded.tableId,
		state: evolveGame(loaded.state, events),
		tableVersion,
		handId,
		handVersion: newHandVersion,
		leaseEpoch: Math.max(loaded.leaseEpoch, metadata?.leaseEpoch ?? 0),
	};
}
