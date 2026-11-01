import { initialHandState } from "@holdem/engine";
import { seatTaken, tableWith } from "../../../../../test/support/table.js";
import type { IntegrationEventBus } from "@/shared/application/integration-events.js";
import { replayTable } from "../../domain/evolve-table.js";
import type { TableEvent } from "../../domain/table-events.js";
import { PublishTableSummaryHandler } from "./publish-table-summary.handler.js";
import { TableChanged } from "./table-changed.event.js";
import { TableSummaryChanged } from "./table-summary-changed.event.js";

function setUp() {
	const published: unknown[] = [];
	const handler = new PublishTableSummaryHandler({
		publish: (...events: unknown[]) => published.push(...events),
	} as unknown as IntegrationEventBus);
	const change = (history: TableEvent[], added: TableEvent[]) =>
		handler.handle(
			new TableChanged(
				"table-1",
				{ tableVersion: history.length, hand: null },
				{ table: added, hand: [] },
				{ table: replayTable(history), hand: initialHandState },
			),
		);
	return { published, change };
}

describe("PublishTableSummaryHandler", () => {
	it("tells the lobby who sits at the table once that changes", () => {
		const { published, change } = setUp();

		change(tableWith(0, 3), [seatTaken(3)]);

		expect(published).toEqual([
			new TableSummaryChanged(
				"table-1",
				"open",
				[
					{ seat: 0, userId: "u0" },
					{ seat: 3, userId: "u3" },
				],
				0,
			),
		]);
	});

	it("counts the hands that ended, and stays quiet about anything else", () => {
		const { published, change } = setUp();
		const settled: TableEvent = {
			type: "HandSettled",
			v: 1,
			handId: "h-1",
			stacks: [],
		};

		change(tableWith(0, 1), [{ type: "SpectatorJoined", v: 1, userId: "s" }]);
		change(tableWith(0, 1), [settled]);

		expect(published).toEqual([
			expect.objectContaining({ tableId: "table-1", handsSettled: 1 }),
		]);
	});
});
