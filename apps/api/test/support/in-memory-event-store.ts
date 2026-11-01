import {
	ConcurrencyError,
	type EventMetadata,
	FencedError,
	EventStore,
	type RecordedEvent,
	type StoredEvent,
	type StreamAppend,
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
		this.check(streamId, expectedVersion, metadata);
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

	async appendToStreams(
		appends: readonly StreamAppend<E>[],
		metadata: EventMetadata = {},
	): Promise<readonly number[]> {
		for (const { streamId, expectedVersion } of appends) {
			this.check(streamId, expectedVersion, metadata);
		}
		const versions: number[] = [];
		for (const { streamId, expectedVersion, events } of appends) {
			versions.push(
				await this.append(streamId, expectedVersion, events, metadata),
			);
		}
		return versions;
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

	/** An append's rules: no newer lease epoch on the stream, and the stream at `expectedVersion`. */
	private check(
		streamId: string,
		expectedVersion: number,
		{ leaseEpoch }: EventMetadata,
	): void {
		const last = this.log.findLast((r) => r.streamId === streamId);
		if (
			leaseEpoch !== undefined &&
			(last?.metadata.leaseEpoch ?? 0) > leaseEpoch
		) {
			throw new FencedError(streamId, leaseEpoch);
		}
		if (this.versionOf(streamId) !== expectedVersion) {
			throw new ConcurrencyError(streamId, expectedVersion);
		}
	}

	private versionOf(streamId: string): number {
		return this.log.filter((r) => r.streamId === streamId).length;
	}

	private upcasted(recorded: RecordedEvent<StoredEvent>): RecordedEvent<E> {
		return {
			...recorded,
			event: upcast(recorded.event, this.upcasters) as unknown as E,
		};
	}
}
