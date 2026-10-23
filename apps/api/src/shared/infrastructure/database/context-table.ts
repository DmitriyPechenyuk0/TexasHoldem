import { pgTableCreator } from "drizzle-orm/pg-core";

/**
 * Table factory for one bounded context: `contextTable("lobby")("tables", …)` creates `lobby_tables`,
 * and camelCase property names become snake_case columns. Every module schema starts here, so the
 * context prefix cannot be forgotten.
 */
export const contextTable = (context: string) =>
	pgTableCreator((name) => `${context}_${name}`, "snake_case");
