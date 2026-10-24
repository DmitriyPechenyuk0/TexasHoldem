import { CARD_COUNT, formatCards } from "./card.js";
import { fullDeck } from "./deck.js";

describe("fullDeck", () => {
	it("holds 52 unique cards", () => {
		const deck = fullDeck();
		expect(deck).toHaveLength(CARD_COUNT);
		expect(new Set(deck).size).toBe(CARD_COUNT);
	});

	it("is in canonical order: by rank, clubs to spades within a rank", () => {
		const text = formatCards(fullDeck());
		expect(text.startsWith("2c 2d 2h 2s 3c")).toBe(true);
		expect(text.endsWith("Kc Kd Kh Ks Ac Ad Ah As")).toBe(true);
	});

	it("returns a new array every time, so shuffling one never affects another", () => {
		const first = fullDeck();
		first.reverse();
		expect(fullDeck()[0]).toBe(0);
		expect(fullDeck()).not.toBe(fullDeck());
	});
});
