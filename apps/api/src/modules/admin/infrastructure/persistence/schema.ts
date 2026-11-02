import { index, jsonb, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { contextTable } from "@/shared/infrastructure/database/index.js";

const table = contextTable("admin");

/**
 * What admins did (POK-114), kept for good. Ids come from the session and the other contexts,
 * with no foreign key into their tables; `admin_id` is null for a change made outside the app.
 */
export const audit = table(
	"audit",
	{
		id: uuid().primaryKey(),
		adminId: uuid(),
		/** `force-close-table` | `revoke-sessions` | `set-role`. */
		action: text().notNull(),
		target: text().notNull(),
		details: jsonb().$type<Record<string, unknown>>().notNull().default({}),
		at: timestamp({ withTimezone: true }).notNull(),
	},
	(columns) => [index().on(columns.at)],
);
