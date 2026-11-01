import type { TableRuntimeRegistry } from "../../runtime/table-runtime-registry.js";
import { ExecuteTableCommand } from "./execute-table-command.command.js";
import { ExecuteTableCommandHandler } from "./execute-table-command.handler.js";

describe("ExecuteTableCommandHandler", () => {
	it("runs the command, with its metadata, on the table, wherever it runs", async () => {
		const execute = vi.fn().mockResolvedValue(undefined);
		const handler = new ExecuteTableCommandHandler({
			execute,
		} as unknown as TableRuntimeRegistry);

		await handler.execute(
			new ExecuteTableCommand(
				"t-1",
				{ type: "SitOut", userId: "u0" },
				{ userId: "u0" },
			),
		);

		expect(execute).toHaveBeenCalledWith(
			"t-1",
			{ type: "SitOut", userId: "u0" },
			{ userId: "u0" },
		);
	});
});
