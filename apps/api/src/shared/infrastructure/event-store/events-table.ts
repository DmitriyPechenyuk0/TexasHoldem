import {
	bigserial,
	integer,
	jsonb,
	text,
	timestamp,
	unique,
} from "drizzle-orm/pg-core";
import type { EventMetadata } from "../../application/event-store.js";
import { contextTable } from "../database/index.js";

/**
 * The event table of one context (`<context>_events`), holding every stream of it. A context's
 * schema declares its own, so the table stays the context's: `eventsTable("table")`.
 */
export const eventsTable = (context: string) =>
	contextTable(context)(
		"events",
		{
			globalPosition: bigserial({ mode: "number" }).primaryKey(),
			streamId: text().notNull(),
			version: integer().notNull(),
			type: text().notNull(),
			schemaVersion: integer().notNull(),
			/** The event without `type` and `v`, which have columns of their own. */
			payload: jsonb().$type<Record<string, unknown>>().notNull(),
			metadata: jsonb().$type<EventMetadata>().notNull(),
			occurredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
		},
		// Also the index for reading a stream in order and for its current version.
		(events) => [unique().on(events.streamId, events.version)],
	);

export type EventsTable = ReturnType<typeof eventsTable>;
