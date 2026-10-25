import { text, timestamp, uuid } from "drizzle-orm/pg-core";
import { contextTable } from "@/shared/infrastructure/database/index.js";

const table = contextTable("profile");

/**
 * One row per account, created on `UserRegistered`. No foreign key into identity's tables: contexts
 * share no tables, and the id comes from the event.
 */
export const profiles = table("profiles", {
	userId: uuid().primaryKey(),
	/** A copy of identity's username, lowercase, for public profile lookups. */
	username: text().notNull().unique(),
	nickname: text().notNull(),
	avatarKey: text(),
	locale: text().notNull(),
	createdAt: timestamp({ withTimezone: true }).notNull(),
	updatedAt: timestamp({ withTimezone: true })
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date()),
});
