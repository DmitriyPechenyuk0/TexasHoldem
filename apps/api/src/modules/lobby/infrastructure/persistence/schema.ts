import { index, integer, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { contextTable } from "@/shared/infrastructure/database/index.js";

const table = contextTable("lobby");

/**
 * One row per table created through the lobby, with what it was created with. The table's id is
 * its event stream's; the creator's id comes from the session, with no foreign key into identity.
 */
export const lobbyTables = table(
	"tables",
	{
		id: uuid().primaryKey(),
		name: text().notNull(),
		presetId: text().notNull(),
		maxSeats: integer().notNull(),
		/** `public` | `private`. */
		visibility: text().notNull(),
		creatorId: uuid().notNull(),
		/** `open` | `closed`. */
		status: text().notNull(),
		createdAt: timestamp({ withTimezone: true }).notNull(),
		/** A private table's invite code; null for a public one. */
		inviteCode: text().unique(),
		/** A private table's password, hashed (scrypt); never the password. */
		passwordHash: text(),
	},
	(columns) => [index().on(columns.creatorId, columns.status)],
);
