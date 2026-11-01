import { CanJoinTableQuery } from "@/shared/application/table-access.js";
import {
	InMemoryLobbyTables,
	InMemoryTableGrants,
	privateTable,
} from "../../commands/in-memory-lobby.js";
import { CanJoinTableHandler } from "./can-join-table.handler.js";

describe("CanJoinTableHandler", () => {
	it("lets anyone join a public table, and at a private one its creator and invited users", async () => {
		const grants = new InMemoryTableGrants();
		await grants.grant("t-1", "invited");
		const handler = new CanJoinTableHandler(
			new InMemoryLobbyTables(
				privateTable(),
				privateTable({ id: "t-2", visibility: "public", inviteCode: null }),
			),
			grants,
		);
		const may = (tableId: string, userId: string) =>
			handler.execute(new CanJoinTableQuery(tableId, userId));

		expect(await may("t-1", "u-1")).toBe(true);
		expect(await may("t-1", "invited")).toBe(true);
		expect(await may("t-1", "stranger")).toBe(false);
		expect(await may("t-2", "stranger")).toBe(true);
		// Not a lobby table (a dev table): the table itself decides.
		expect(await may("dev-table", "stranger")).toBe(true);
	});
});
