import type { Decider } from "../domain/decider.js";
import type {
	EventMetadata,
	EventStore,
	VersionedEvent,
} from "./event-store.js";

/** What folding a stream needs from its decider. */
export type Evolver<S, E> = Pick<
	Decider<unknown, S, E>,
	"evolve" | "initialState"
>;

/** A stream's state and the version it was folded up to, which the next append expects. */
export interface LoadedStream<S> {
	readonly state: S;
	readonly version: number;
}

/** Folds the whole stream; an unknown stream is the initial state at version 0. */
export async function loadDecider<S, E extends VersionedEvent>(
	store: EventStore<E>,
	decider: Evolver<S, E>,
	streamId: string,
): Promise<LoadedStream<S>> {
	const recorded = await store.readStream(streamId);
	return {
		state: recorded.reduce(
			(state, { event }) => decider.evolve(state, event),
			decider.initialState,
		),
		version: recorded.at(-1)?.version ?? 0,
	};
}

/**
 * Appends the events a decision produced to the stream it was made on, and answers the state and
 * version after them. Throws `ConcurrencyError` when another append got there first.
 */
export async function saveDecider<S, E extends VersionedEvent>(
	store: EventStore<E>,
	decider: Evolver<S, E>,
	streamId: string,
	loaded: LoadedStream<S>,
	events: readonly E[],
	metadata?: EventMetadata,
): Promise<LoadedStream<S>> {
	const version = await store.append(
		streamId,
		loaded.version,
		events,
		metadata,
	);
	return {
		state: events.reduce(
			(state, event) => decider.evolve(state, event),
			loaded.state,
		),
		version,
	};
}
