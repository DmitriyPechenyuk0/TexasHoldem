import type { LobbyTable } from "./lobby-table.js";

export abstract class LobbyTableRepository {
	/**
	 * Stores a new table unless its creator already has `limit` open ones; answers whether it did.
	 * Two tables created at once by one player cannot both slip under the limit.
	 */
	abstract addUnderLimit(table: LobbyTable, limit: number): Promise<boolean>;

	/** Forgets a table that could not be opened. */
	abstract remove(tableId: string): Promise<void>;
}
