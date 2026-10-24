import { getTableName } from "drizzle-orm";
import { getTableConfig, integer, uuid } from "drizzle-orm/pg-core";
import { contextTable } from "./context-table.js";

describe("contextTable", () => {
	const lobbyTables = contextTable("lobby")("tables", {
		id: uuid().primaryKey(),
		smallBlind: integer().notNull(),
	});

	it("prefixes the table with its bounded context", () => {
		expect(getTableName(lobbyTables)).toBe("lobby_tables");
	});

	it("maps camelCase properties to snake_case columns", () => {
		expect(
			getTableConfig(lobbyTables).columns.map((column) => column.name),
		).toEqual(["id", "small_blind"]);
	});
});
