import { text, timestamp } from "drizzle-orm/pg-core";
import { contextTable } from "@/shared/infrastructure/database/index.js";
import { eventsTable } from "@/shared/infrastructure/event-store/index.js";

/** The table streams (`table-<id>`) and the hand streams (`hand-<id>`). */
export const tableEvents = eventsTable("table");

const table = contextTable("table");

/**
 * Each hand's server seed (ADR-008). Secret until the hand has ended, like the deck in its stream:
 * no client and no log may read it before `revealedAt` is set.
 */
export const handDecks = table("hand_decks", {
	handId: text().primaryKey(),
	tableId: text().notNull(),
	/** Hex. */
	serverSeed: text().notNull(),
	/** Hex SHA-256 of the server seed. */
	commitment: text().notNull(),
	createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
	revealedAt: timestamp({ withTimezone: true }),
});
