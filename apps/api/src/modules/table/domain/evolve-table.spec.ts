import { seatTaken, tableWith } from "../../../../test/support/table.js";
import { evolveTable, replayTable } from "./evolve-table.js";
import { initialTableState } from "./table-state.js";

describe("evolveTable", () => {
	it("throws on an event before the table opens: the stream is corrupt", () => {
		expect(() => evolveTable(initialTableState, seatTaken(0))).toThrow(
			"SeatTaken cannot come before TableOpened",
		);
	});

	it("throws on an event for an empty seat", () => {
		expect(() =>
			replayTable([
				...tableWith(0),
				{ type: "PlayerStatusChanged", v: 1, seat: 3, status: "active" },
			]),
		).toThrow("Seat 3 of table table-1 is empty");
	});
});
