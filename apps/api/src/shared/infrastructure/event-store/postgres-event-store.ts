import { and, asc, eq, gt, gte, sql } from "drizzle-orm";
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
} from "../../application/event-store.js";
import { type Database, isUniqueViolation } from "../database/index.js";
import type { EventsTable } from "./events-table.js";

type EventRow = EventsTable["$inferSelect"];

/** The client or a transaction of it. */
type Executor = Pick<Database, "execute">;

/**
 * The event store in Postgres, over one context's events table. Neither payloads nor metadata are
 * ever logged: hand events carry the deck, and must stay as secret as the seed until the hand ends.
 */
export class PostgresEventStore<
	E extends VersionedEvent = VersionedEvent,
> extends EventStore<E> {
	constructor(
		private readonly db: Database,
		private readonly table: EventsTable,
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
		await this.insert(this.db, { streamId, expectedVersion, events }, metadata);
		return expectedVersion + events.length;
	}

	async appendToStreams(
		appends: readonly StreamAppend<E>[],
		metadata: EventMetadata = {},
	): Promise<readonly number[]> {
		await this.db.transaction(async (tx) => {
			for (const append of appends) {
				await this.insert(tx, append, metadata);
			}
		});
		return appends.map(
			({ expectedVersion, events }) => expectedVersion + events.length,
		);
	}

	/**
	 * One statement, so a single round trip: it inserts nothing unless the stream is at the expected
	 * version and, for a fenced append, its last event's lease epoch is no newer. Two appends that
	 * both see that version race for the next one, and the unique (stream, version) constraint
	 * turns the loser away. Epochs only grow along a stream, so its last event has the newest.
	 */
	private async insert(
		db: Executor,
		{ streamId, expectedVersion, events }: StreamAppend<E>,
		metadata: EventMetadata,
	): Promise<void> {
		if (events.length === 0) {
			return;
		}
		const stored = events.map(({ type, v, ...payload }) => ({
			type,
			v,
			payload,
		}));
		const { table } = this;
		const column = (name: keyof EventRow) => sql.identifier(table[name].name);
		const { leaseEpoch } = metadata;
		const last = sql`(select ${table.metadata} from ${table}
			where ${table.streamId} = ${streamId} order by ${table.version} desc limit 1)`;
		const fenced =
			leaseEpoch === undefined
				? sql``
				: sql`and coalesce((${last}->>'leaseEpoch')::bigint, 0) <= ${leaseEpoch}`;

		const insert = sql`
			insert into ${table} (${column("streamId")}, ${column("version")}, ${column("type")},
				${column("schemaVersion")}, ${column("payload")}, ${column("metadata")})
			select ${streamId}, ${expectedVersion}::int + e.position, e.event->>'type',
				(e.event->>'v')::int, e.event->'payload', ${JSON.stringify(metadata)}::jsonb
			from jsonb_array_elements(${JSON.stringify(stored)}::jsonb)
				with ordinality as e(event, position)
			where (select coalesce(max(${table.version}), 0) from ${table}
				where ${table.streamId} = ${streamId}) = ${expectedVersion}
			${fenced}
			returning ${column("version")}`;

		let inserted: readonly unknown[];
		try {
			inserted = await db.execute(insert, "objects");
		} catch (error) {
			if (isUniqueViolation(error)) {
				throw new ConcurrencyError(streamId, expectedVersion, {
					cause: error,
				});
			}
			throw error;
		}
		if (inserted.length === 0) {
			throw await this.refusal(db, streamId, expectedVersion, leaseEpoch);
		}
	}

	/** Why an append inserted nothing: a newer lease epoch, or a stream that moved on. */
	private async refusal(
		db: Executor,
		streamId: string,
		expectedVersion: number,
		leaseEpoch: number | undefined,
	): Promise<Error> {
		if (leaseEpoch !== undefined) {
			const { table } = this;
			const [last] = await db.execute<{ epoch: string | null }>(
				sql`select ${table.metadata}->>'leaseEpoch' as epoch from ${table}
					where ${table.streamId} = ${streamId} order by ${table.version} desc limit 1`,
				"objects",
			);
			if (last?.epoch != null && Number(last.epoch) > leaseEpoch) {
				return new FencedError(streamId, leaseEpoch);
			}
		}
		return new ConcurrencyError(streamId, expectedVersion);
	}

	async readStream(
		streamId: string,
		fromVersion = 1,
	): Promise<readonly RecordedEvent<E>[]> {
		const rows = await this.db
			.select()
			.from(this.table)
			.where(
				and(
					eq(this.table.streamId, streamId),
					gte(this.table.version, fromVersion),
				),
			)
			.orderBy(asc(this.table.version));
		return rows.map((row) => this.toRecorded(row));
	}

	async readAll(
		fromPosition: number,
		limit: number,
	): Promise<readonly RecordedEvent<E>[]> {
		const rows = await this.db
			.select()
			.from(this.table)
			.where(gt(this.table.globalPosition, fromPosition))
			.orderBy(asc(this.table.globalPosition))
			.limit(limit);
		return rows.map((row) => this.toRecorded(row));
	}

	private toRecorded(row: EventRow): RecordedEvent<E> {
		const stored: StoredEvent = {
			...row.payload,
			type: row.type,
			v: row.schemaVersion,
		};
		return {
			// Upcasters bring every event to the current shape, which is what E describes.
			event: upcast(stored, this.upcasters) as unknown as E,
			streamId: row.streamId,
			version: row.version,
			globalPosition: row.globalPosition,
			metadata: row.metadata,
			occurredAt: row.occurredAt,
		};
	}
}
