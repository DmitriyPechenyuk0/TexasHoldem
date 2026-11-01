import { NotSeatedError } from "../../../domain/table-errors.js";
import type { TableRuntimeRegistry } from "../../runtime/table-runtime-registry.js";
import type { TablePresence } from "../../table-presence.js";
import { DisconnectFromTableCommand } from "./disconnect-from-table.command.js";
import { DisconnectFromTableHandler } from "./disconnect-from-table.handler.js";

function setUp(last: boolean, outcome: Promise<unknown>) {
	const disconnect = vi.fn().mockResolvedValue(last);
	const execute = vi.fn().mockReturnValue(outcome);
	const get = vi.fn().mockReturnValue({ execute });
	const handler = new DisconnectFromTableHandler(
		{ disconnect } as unknown as TablePresence,
		{ get } as unknown as TableRuntimeRegistry,
	);
	return { handler, disconnect, execute };
}

const command = new DisconnectFromTableCommand("t-1", "u0", "socket-1");

describe("DisconnectFromTableHandler", () => {
	it("tells the table once the user's last connection to it is gone", async () => {
		const { handler, disconnect, execute } = setUp(
			true,
			Promise.resolve({ table: [], hand: [] }),
		);

		await handler.execute(command);

		expect(disconnect).toHaveBeenCalledWith("t-1", "u0", "socket-1");
		expect(execute).toHaveBeenCalledWith(
			{ type: "Disconnect", userId: "u0" },
			{ userId: "u0" },
		);
	});

	it("leaves the table alone while another connection of the user follows it", async () => {
		const { handler, execute } = setUp(false, Promise.resolve());

		await handler.execute(command);

		expect(execute).not.toHaveBeenCalled();
	});

	it("takes the refusal for a user with nothing at the table, and passes other failures on", async () => {
		await expect(
			setUp(true, Promise.reject(new NotSeatedError())).handler.execute(
				command,
			),
		).resolves.toBeUndefined();
		await expect(
			setUp(true, Promise.reject(new Error("store down"))).handler.execute(
				command,
			),
		).rejects.toThrow("store down");
	});
});
