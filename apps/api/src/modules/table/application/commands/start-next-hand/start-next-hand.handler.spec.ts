import type { TableRuntimeRegistry } from "../../runtime/table-runtime-registry.js";
import { StartNextHandCommand } from "./start-next-hand.command.js";
import { StartNextHandHandler } from "./start-next-hand.handler.js";

describe("StartNextHandHandler", () => {
	it("deals the table's next hand, wherever it runs", async () => {
		const dealNextHand = vi.fn().mockResolvedValue(false);
		const handler = new StartNextHandHandler({
			dealNextHand,
		} as unknown as TableRuntimeRegistry);

		expect(await handler.execute(new StartNextHandCommand("t-1"))).toBe(false);
		expect(dealNextHand).toHaveBeenCalledWith("t-1");
	});
});
