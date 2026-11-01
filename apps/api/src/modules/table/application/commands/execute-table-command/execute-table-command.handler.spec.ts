import type { TableRuntimeRegistry } from "../../runtime/table-runtime-registry.js";
import { ExecuteTableCommand } from "./execute-table-command.command.js";
import { ExecuteTableCommandHandler } from "./execute-table-command.handler.js";

describe("ExecuteTableCommandHandler", () => {
	it("queues the command, with its metadata, in the table's runtime", async () => {
		const execute = vi.fn().mockResolvedValue({ table: [], hand: [] });
		const get = vi.fn().mockReturnValue({ execute });
		const handler = new ExecuteTableCommandHandler({
			get,
		} as unknown as TableRuntimeRegistry);

		const events = await handler.execute(
			new ExecuteTableCommand(
				"t-1",
				{ type: "SitOut", userId: "u0" },
				{ userId: "u0" },
			),
		);

		expect(events).toEqual({ table: [], hand: [] });
		expect(get).toHaveBeenCalledWith("t-1");
		expect(execute).toHaveBeenCalledWith(
			{ type: "SitOut", userId: "u0" },
			{ userId: "u0" },
		);
	});
});
