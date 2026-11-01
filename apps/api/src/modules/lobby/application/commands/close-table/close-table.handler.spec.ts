import type { CommandBus } from "@nestjs/cqrs";
import { ExecuteTableCommand } from "@/modules/table/index.js";
import { InMemoryLobbyTables, privateTable } from "../in-memory-lobby.js";
import { CloseTableCommand } from "./close-table.command.js";
import { CloseTableHandler } from "./close-table.handler.js";

function setUp() {
	const sent: unknown[] = [];
	const tables = new InMemoryLobbyTables(
		privateTable(),
		privateTable({ id: "t-2", players: [{ seat: 0, userId: "u-2" }] }),
	);
	const handler = new CloseTableHandler(tables, {
		execute: async (command: unknown) => sent.push(command),
	} as unknown as CommandBus);
	return { sent, handler };
}

describe("CloseTableHandler", () => {
	it("lets the creator close their empty table", async () => {
		const { sent, handler } = setUp();

		await handler.execute(new CloseTableCommand("t-1", "u-1"));

		expect(sent).toEqual([
			new ExecuteTableCommand("t-1", { type: "CloseTable" }, { userId: "u-1" }),
		]);
	});

	it("refuses anyone else, a table someone sits at, and one it does not know", async () => {
		const { sent, handler } = setUp();
		const codeOf = (tableId: string, userId: string) =>
			handler
				.execute(new CloseTableCommand(tableId, userId))
				.catch((error: { code: string }) => error.code);

		expect(await codeOf("t-1", "u-2")).toBe("lobby.not-creator");
		expect(await codeOf("t-2", "u-1")).toBe("lobby.table-not-empty");
		expect(await codeOf("nope", "u-1")).toBe("lobby.table-not-found");
		expect(sent).toEqual([]);
	});
});
