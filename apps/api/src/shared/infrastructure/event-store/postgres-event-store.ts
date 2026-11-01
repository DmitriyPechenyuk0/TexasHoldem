import { and, asc, eq, gt, gte, sql } from "drizzle-orm";
import {
	ConcurrencyError,
	type EventMetadata,
	EventStore,
	type RecordedEvent,
	type StoredEvent,
	type Upcasters,
	upcast,
	type VersionedEvent,
} from "../../application/event-store.js";
import { type Database, isUniqueViolation } from "../database/index.js";
import type { EventsTable } from "./events-table.js";

type EventRow = EventsTable["$inferSelect"];

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
		if (events.length === 0) {
			return expectedVersion;
		}
		const stored = events.map(({ type, v, ...payload }) => ({
			type,
			v,
			payload,
		}));
		const { table } = this;
		const column = (name: keyof EventRow) => sql.identifier(table[name].name);

		// One statement, so a single round trip: it inserts nothing unless the stream is at the
		// expected version. Two appends that both see that version race for the next one, and the
		// unique (stream, version) constraint turns the loser away.
		const insert = sql`
			insert into ${table} (${column("streamId")}, ${column("version")}, ${column("type")},
				${column("schemaVersion")}, ${column("payload")}, ${column("metadata")})
			select ${streamId}, ${expectedVersion}::int + e.position, e.event->>'type',
				(e.event->>'v')::int, e.event->'payload', ${JSON.stringify(metadata)}::jsonb
			from jsonb_array_elements(${JSON.stringify(stored)}::jsonb)
				with ordinality as e(event, position)
			where (select coalesce(max(${table.version}), 0) from ${table}
				where ${table.streamId} = ${streamId}) = ${expectedVersion}
			returning ${column("version")}`;

		let inserted: readonly unknown[];
		try {
			inserted = await this.db.execute(insert, "objects");
		} catch (error) {
			if (isUniqueViolation(error)) {
				throw new ConcurrencyError(streamId, expectedVersion, { cause: error });
			}
			throw error;
		}
		if (inserted.length === 0) {
			throw new ConcurrencyError(streamId, expectedVersion);
		}
		return expectedVersion + events.length;
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
