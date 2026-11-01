import { primaryKey, timestamp, uuid } from "drizzle-orm/pg-core";
import { contextTable } from "@/shared/infrastructure/database/index.js";

const table = contextTable("chat");

/**
 * Whom each player muted: their messages are hidden for the muter only, by the client. Kept in
 * Postgres, unlike messages, so the list is the same on every device. Ids come from the session,
 * with no foreign key into identity.
 */
export const mutes = table(
	"mutes",
	{
		userId: uuid().notNull(),
		mutedId: uuid().notNull(),
		mutedAt: timestamp({ withTimezone: true }).notNull(),
	},
	(columns) => [primaryKey({ columns: [columns.userId, columns.mutedId] })],
);
