import type {
	LobbyTable,
	LobbyTableStatus,
	TableVisibility,
} from "../../domain/lobby-table.js";
import type { lobbyTables } from "./schema.js";

export type LobbyTableRow = typeof lobbyTables.$inferSelect;

/** A row as the domain's table: its text columns narrowed to the values they hold. */
export const toLobbyTable = (row: LobbyTableRow): LobbyTable => ({
	...row,
	visibility: row.visibility as TableVisibility,
	status: row.status as LobbyTableStatus,
});
