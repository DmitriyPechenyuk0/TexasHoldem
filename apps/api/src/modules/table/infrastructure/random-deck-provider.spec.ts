import { CARD_COUNT } from "@holdem/engine";
import { RandomDeckProvider } from "./random-deck-provider.js";

describe("RandomDeckProvider", () => {
	it("deals a whole deck in a fresh order each time, with a button draw", async () => {
		const decks = new RandomDeckProvider();

		const first = await decks.deal("hand-1");
		const second = await decks.deal("hand-1");

		expect(first.deck.toSorted((a, b) => a - b)).toEqual(
			Array.from({ length: CARD_COUNT }, (_, card) => card),
		);
		expect(second.deck).not.toEqual(first.deck);
		expect(Number.isSafeInteger(first.buttonDraw)).toBe(true);
		expect(first.buttonDraw).toBeGreaterThanOrEqual(0);
	});
});
