import type { TableRuntimeRegistry } from "../../runtime/table-runtime-registry.js";
import { StartNextHandCommand } from "./start-next-hand.command.js";
import { StartNextHandHandler } from "./start-next-hand.handler.js";

describe("StartNextHandHandler", () => {
	it("queues the deal in the table's runtime", async () => {
		const dealNextHand = vi.fn().mockResolvedValue(null);
		const get = vi.fn().mockReturnValue({ dealNextHand });
		const handler = new StartNextHandHandler({
			get,
		} as unknown as TableRuntimeRegistry);

		expect(await handler.execute(new StartNextHandCommand("t-1"))).toBeNull();
		expect(get).toHaveBeenCalledWith("t-1");
		expect(dealNextHand).toHaveBeenCalledOnce();
	});
});
