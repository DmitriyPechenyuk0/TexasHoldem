import { DomainError } from "../domain/domain-error.js";

/** What every stored event is: plain JSON with a `type` and a schema version `v`. */
export interface VersionedEvent {
	readonly type: string;
	readonly v: number;
}

/** Who and what caused the events of one append; stored next to each of them. */
export interface EventMetadata {
	/** The request or command chain the events belong to. */
	readonly correlationId?: string;
	/** The command or event that produced them. */
	readonly causationId?: string;
	readonly userId?: string;
}

export interface RecordedEvent<E extends VersionedEvent> {
	readonly event: E;
	readonly streamId: string;
	/** 1 for the stream's first event, then one more for each. */
	readonly version: number;
	/** Order across every stream of the store. */
	readonly globalPosition: number;
	readonly metadata: EventMetadata;
	readonly occurredAt: Date;
}

/** Another command appended to the stream since it was read: read it again and decide again. */
export class ConcurrencyError extends DomainError {
	readonly kind = "conflict";
	readonly code = "event-store.version-conflict";

	constructor(
		streamId: string,
		expectedVersion: number,
		options?: ErrorOptions,
	) {
		super(`Stream ${streamId} is no longer at version ${expectedVersion}`, {
			...options,
			params: { streamId, expectedVersion },
		});
	}
}

/**
 * Port for append-only event streams (ADR-002). Events are never changed once stored: a schema
 * change bumps `v` and adds an upcaster, which reads turn old events into the current shape with.
 */
export abstract class EventStore<E extends VersionedEvent = VersionedEvent> {
	/**
	 * Appends `events` to a stream that must be at `expectedVersion` (0 for a new stream), all or
	 * none, and answers its new version. Throws `ConcurrencyError` when the stream has moved on.
	 */
	abstract append(
		streamId: string,
		expectedVersion: number,
		events: readonly E[],
		metadata?: EventMetadata,
	): Promise<number>;

	/** The stream's events from `fromVersion` (1 by default) on, in order; none for an unknown stream. */
	abstract readStream(
		streamId: string,
		fromVersion?: number,
	): Promise<readonly RecordedEvent<E>[]>;

	/** Up to `limit` events of every stream after `fromPosition` (0 for the start), for projections. */
	abstract readAll(
		fromPosition: number,
		limit: number,
	): Promise<readonly RecordedEvent<E>[]>;
}

/** A stored event as read, before it is known to have the current shape. */
export type StoredEvent = VersionedEvent & Readonly<Record<string, unknown>>;

/** Turns an event of one schema version into the next one (or into another type). */
export type Upcaster = (event: StoredEvent) => StoredEvent;

/** Upcasters by event type, then by the schema version they upgrade from. */
export type Upcasters = Readonly<
	Record<string, Readonly<Record<number, Upcaster>>>
>;

/** Applies upcasters until none matches, so an event of any age reaches the current version. */
export function upcast(event: StoredEvent, upcasters: Upcasters): StoredEvent {
	let current = event;
	for (
		let upcaster = upcasters[current.type]?.[current.v];
		upcaster;
		upcaster = upcasters[current.type]?.[current.v]
	) {
		const next = upcaster(current);
		// A type change may restart at v 1; only an upcaster that keeps the type and the version loops.
		if (next.type === current.type && next.v <= current.v) {
			throw new Error(
				`Upcaster for ${current.type} v${current.v} must raise the version, got v${next.v}`,
			);
		}
		current = next;
	}
	return current;
}
