import { NotDisconnectedError } from "../../../domain/table-errors.js";
import type { TableRuntimeRegistry } from "../../runtime/table-runtime-registry.js";
import type { TablePresence } from "../../table-presence.js";
import { ConnectToTableCommand } from "./connect-to-table.command.js";
import { ConnectToTableHandler } from "./connect-to-table.handler.js";

function setUp(first: boolean, outcome: Promise<unknown>) {
	const connect = vi.fn().mockResolvedValue(first);
	const execute = vi.fn().mockReturnValue(outcome);
	const get = vi.fn().mockReturnValue({ execute });
	const handler = new ConnectToTableHandler(
		{ connect } as unknown as TablePresence,
		{ get } as unknown as TableRuntimeRegistry,
	);
	return { handler, connect, execute };
}

const command = new ConnectToTableCommand("t-1", "u0", "socket-1");

describe("ConnectToTableHandler", () => {
	it("tells the table the user is back on their first connection", async () => {
		const { handler, connect, execute } = setUp(
			true,
			Promise.resolve({ table: [], hand: [] }),
		);

		await handler.execute(command);

		expect(connect).toHaveBeenCalledWith("t-1", "u0", "socket-1");
		expect(execute).toHaveBeenCalledWith(
			{ type: "Reconnect", userId: "u0" },
			{ userId: "u0" },
		);
	});

	it("leaves the table alone while another connection of the user follows it", async () => {
		const { handler, execute } = setUp(false, Promise.resolve());

		await handler.execute(command);

		expect(execute).not.toHaveBeenCalled();
	});

	it("takes the table's refusal of a user who was not away, and passes other failures on", async () => {
		await expect(
			setUp(true, Promise.reject(new NotDisconnectedError())).handler.execute(
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
