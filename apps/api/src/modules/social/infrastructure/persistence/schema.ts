import { index, primaryKey, timestamp, uuid } from "drizzle-orm/pg-core";
import { contextTable } from "@/shared/infrastructure/database/index.js";

const table = contextTable("social");

// Player ids come from the session and the profile context, with no foreign key into their tables.

/** Requests waiting for an answer; an answered or cancelled one is deleted. */
export const friendRequests = table(
	"friend_requests",
	{
		fromId: uuid().notNull(),
		toId: uuid().notNull(),
		sentAt: timestamp({ withTimezone: true }).notNull(),
	},
	(columns) => [
		primaryKey({ columns: [columns.fromId, columns.toId] }),
		index().on(columns.toId),
	],
);

/** Two rows per friendship, one from each side, so a player's friends are one index range. */
export const friendships = table(
	"friendships",
	{
		userId: uuid().notNull(),
		friendId: uuid().notNull(),
		since: timestamp({ withTimezone: true }).notNull(),
	},
	(columns) => [primaryKey({ columns: [columns.userId, columns.friendId] })],
);
