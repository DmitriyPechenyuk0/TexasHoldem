import type { LobbyTable, TableSummary } from "./lobby-table.js";

/** What became of a new table: stored, refused for its creator's limit, or its invite code taken. */
export type AddOutcome = "added" | "over-limit" | "code-taken";

export abstract class LobbyTableRepository {
	/**
	 * Stores a new table unless its creator already has `limit` open ones, or another table has its
	 * invite code. Two tables created at once by one player cannot both slip under the limit.
	 */
	abstract addUnderLimit(table: LobbyTable, limit: number): Promise<AddOutcome>;

	/** Forgets a table that could not be opened. */
	abstract remove(tableId: string): Promise<void>;

	abstract findById(tableId: string): Promise<LobbyTable | null>;

	/** The open table this invite code leads to. */
	abstract findOpenByInviteCode(code: string): Promise<LobbyTable | null>;

	/** Gives the table a new invite code; false when another table has it (codes are unique). */
	abstract setInviteCode(tableId: string, code: string): Promise<boolean>;

	/**
	 * Applies the table's summary: who sits there, its status, and the hands that ended. Answers
	 * the table as it is now; null for a table the lobby does not list. A closed table stays closed.
	 */
	abstract applySummary(summary: TableSummary): Promise<LobbyTable | null>;
}
