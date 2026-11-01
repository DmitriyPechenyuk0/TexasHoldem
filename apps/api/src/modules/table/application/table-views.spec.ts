import { fullDeck } from "@holdem/engine";
import { tableWith } from "../../../../test/support/table.js";
import { replayTable } from "../domain/evolve-table.js";
import { decideGame, evolveGame, initialGameState } from "../domain/game.js";
import type { OpenedTable } from "../domain/table-state.js";
import { eventsBatchFor, tableViewFor, viewerAt } from "./table-views.js";

const versions = { tableVersion: 3, hand: null };

function dealt() {
	const before = { ...initialGameState, table: replayTable(tableWith(0, 1)) };
	const decision = decideGame(
		{ type: "StartHand", handId: "h-1", deck: fullDeck(), buttonDraw: 0 },
		before,
	);
	if (!decision.ok) throw decision.error;
	return { events: decision.value, state: evolveGame(before, decision.value) };
}

describe("table views", () => {
	it("see the table from the user's seat, or as a spectator", () => {
		const table = replayTable(tableWith(0, 4)) as OpenedTable;
		expect(viewerAt(table, "u4")).toBe(4);
		expect(viewerAt(table, "someone")).toBe("spectator");
	});

	it("show the table and the hand as the viewer may see it", () => {
		const { state } = dealt();

		const view = tableViewFor(state, versions, 0);

		expect(view).toMatchObject({
			tableId: "table-1",
			versions,
			status: "open",
			settings: { smallBlind: 1, bigBlind: 2, maxSeats: 6 },
			seats: [
				{ seat: 0, userId: "u0", stack: 200, status: "active" },
				{ seat: 1, userId: "u1", stack: 200, status: "active" },
			],
			spectatorCount: 0,
			timer: null,
			fairness: null,
		});
		expect(view.hand.status).toBe("in-progress");
		if (view.hand.status === "idle") return;
		expect(view.hand.players.map((p) => p.holeCards !== null)).toEqual([
			true,
			false,
		]);
		expect(view).not.toHaveProperty("hand.deck");
	});

	it("refuse a table that is not open", () => {
		expect(() => tableViewFor(initialGameState, versions, "spectator")).toThrow(
			expect.objectContaining({ code: "table.not-open" }),
		);
	});

	it("redact each viewer's batch: their own cards only, no deck", () => {
		const { events } = dealt();

		const mine = eventsBatchFor("table-1", versions, events, 1);
		const watching = eventsBatchFor("table-1", versions, events, "spectator");

		expect(mine.table).toBe(events.table);
		// Seats whose cards the batch carries, in seat order.
		const holeCards = (batch: typeof mine) =>
			batch.hand
				.flatMap((e) => (e.type === "HoleCardsDealt" ? e.hands : []))
				.filter((hand) => hand.cards !== null)
				.map((hand) => hand.seat);
		expect(holeCards(mine)).toEqual([1]);
		expect(holeCards(watching)).toEqual([]);
		expect(mine.hand[0]).not.toHaveProperty("deck");
	});
});
