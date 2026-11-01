import {
	ConcurrencyError,
	type EventMetadata,
	EventStore,
	type RecordedEvent,
	type StoredEvent,
	type Upcasters,
	upcast,
	type VersionedEvent,
} from "@/shared/application/event-store.js";

/** Events as stored, before upcasting. Stores that share one log see each other's appends. */
export type InMemoryEventLog = RecordedEvent<StoredEvent>[];

/**
 * The event store for handler tests, with the Postgres store's rules (checked by the same contract
 * in `event-store-contract.ts`). Events go through JSON on the way in, as into a jsonb column.
 */
export class InMemoryEventStore<
	E extends VersionedEvent = VersionedEvent,
> extends EventStore<E> {
	constructor(
		readonly log: InMemoryEventLog = [],
		private readonly upcasters: Upcasters = {},
	) {
		super();
	}

	async append(
		streamId: string,
		expectedVersion: number,
		events: readonly E[],
		metadata: EventMetadata = {},
	): Promise<number> {
		const current = this.log.filter((r) => r.streamId === streamId).length;
		if (current !== expectedVersion) {
			throw new ConcurrencyError(streamId, expectedVersion);
		}
		const occurredAt = new Date();
		events.forEach((event, index) => {
			this.log.push({
				event: JSON.parse(JSON.stringify(event)) as StoredEvent,
				streamId,
				version: expectedVersion + index + 1,
				globalPosition: this.log.length + 1,
				metadata: JSON.parse(JSON.stringify(metadata)) as EventMetadata,
				occurredAt,
			});
		});
		return expectedVersion + events.length;
	}

	async readStream(
		streamId: string,
		fromVersion = 1,
	): Promise<readonly RecordedEvent<E>[]> {
		return this.log
			.filter((r) => r.streamId === streamId && r.version >= fromVersion)
			.map((r) => this.upcasted(r));
	}

	async readAll(
		fromPosition: number,
		limit: number,
	): Promise<readonly RecordedEvent<E>[]> {
		return this.log
			.filter((r) => r.globalPosition > fromPosition)
			.slice(0, limit)
			.map((r) => this.upcasted(r));
	}

	private upcasted(recorded: RecordedEvent<StoredEvent>): RecordedEvent<E> {
		return {
			...recorded,
			event: upcast(recorded.event, this.upcasters) as unknown as E,
		};
	}
}
