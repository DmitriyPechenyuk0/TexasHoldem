import { GetInvitableTableQuery } from "@/shared/application/table-invitations.js";
import { GrantTableAccessCommand } from "@/shared/application/table-invitations.js";
import { GetInvitableTableHandler } from "../../queries/get-invitable-table/get-invitable-table.handler.js";
import {
	InMemoryLobbyTables,
	InMemoryTableGrants,
	privateTable,
} from "../in-memory-lobby.js";
import { GrantTableAccessHandler } from "./grant-table-access.handler.js";

function setUp() {
	const tables = new InMemoryLobbyTables(
		privateTable(),
		privateTable({ id: "t-2", visibility: "public", inviteCode: null }),
		privateTable({ id: "t-3", status: "closed", inviteCode: "ABCDEFGH" }),
	);
	const grants = new InMemoryTableGrants();
	return {
		grants,
		invitable: new GetInvitableTableHandler(tables, grants),
		grant: new GrantTableAccessHandler(tables, grants),
	};
}

describe("inviting friends to tables", () => {
	it("lets a player bring friends to an open table they may join", async () => {
		const { grants, invitable } = setUp();
		const tableOf = (tableId: string, userId: string) =>
			invitable.execute(new GetInvitableTableQuery(tableId, userId));

		expect(await tableOf("t-1", "u-1")).toMatchObject({
			tableId: "t-1",
			name: "Friday game",
			visibility: "private",
			smallBlind: 5,
		});
		expect(await tableOf("t-1", "u-2")).toBeNull();
		await grants.grant("t-1", "u-2");
		expect(await tableOf("t-1", "u-2")).not.toBeNull();
		expect(await tableOf("t-2", "u-3")).toMatchObject({
			visibility: "public",
		});
		expect(await tableOf("t-3", "u-1")).toBeNull();
		expect(await tableOf("nope", "u-1")).toBeNull();
	});

	it("grants an invited friend access to a private table, and needs none for a public one", async () => {
		const { grants, grant } = setUp();

		await grant.execute(new GrantTableAccessCommand("t-1", "u-2"));
		await grant.execute(new GrantTableAccessCommand("t-2", "u-2"));

		expect(grants.granted).toEqual(new Set(["t-1:u-2"]));
		await expect(
			grant.execute(new GrantTableAccessCommand("t-3", "u-2")),
		).rejects.toMatchObject({ code: "lobby.table-not-found" });
	});
});
