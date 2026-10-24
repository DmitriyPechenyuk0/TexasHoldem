import fc from "fast-check";
import {
	card,
	CARD_COUNT,
	type Card,
	formatCard,
	formatCards,
	isCard,
	parseCard,
	parseCards,
	RANKS,
	rankIndexOf,
	rankOf,
	SUITS,
	suitIndexOf,
	suitOf,
} from "./card.js";
import { fullDeck } from "./deck.js";

const allTexts = RANKS.flatMap((rank) => SUITS.map((suit) => `${rank}${suit}`));

describe("cards", () => {
	it("has 13 ranks and 4 suits", () => {
		expect(RANKS).toHaveLength(13);
		expect(SUITS).toHaveLength(4);
		expect(RANKS.length * SUITS.length).toBe(CARD_COUNT);
	});

	it.each([
		["2c", 0],
		["2s", 3],
		["3c", 4],
		["Td", 33],
		["Ah", 50],
		["As", 51],
	])("encodes %s as %i", (text, code) => {
		expect(parseCard(text)).toBe(code);
		expect(formatCard(code as Card)).toBe(text);
	});

	it("round-trips the text form of all 52 cards", () => {
		expect(allTexts).toHaveLength(52);
		for (const text of allTexts) {
			expect(formatCard(parseCard(text))).toBe(text);
		}
	});

	it("builds a card from its rank and suit, and reads them back", () => {
		for (const rank of RANKS) {
			for (const suit of SUITS) {
				const built = card(rank, suit);
				expect(rankOf(built)).toBe(rank);
				expect(suitOf(built)).toBe(suit);
				expect(RANKS[rankIndexOf(built)]).toBe(rank);
				expect(SUITS[suitIndexOf(built)]).toBe(suit);
				expect(built).toBe(parseCard(`${rank}${suit}`));
			}
		}
	});

	it("orders cards by rank, then suit: the order of a draw for seats", () => {
		const draw = ["Ks", "Ac", "Kh", "2c", "As"].map(parseCard);
		expect(formatCards(draw.toSorted((a, b) => b - a))).toBe("As Ac Ks Kh 2c");
	});

	it.each(["", "A", "Ass", "1s", "10s", "as", "AS", "Ax", "Xs", " As", "As "])(
		"rejects %j",
		(text) => {
			expect(() => parseCard(text)).toThrow(RangeError);
		},
	);

	it("rejects every string that is not one of the 52 spellings", () => {
		fc.assert(
			fc.property(
				fc.string({ maxLength: 4 }).filter((text) => !allTexts.includes(text)),
				(text) => {
					expect(() => parseCard(text)).toThrow(
						`Not a card: ${JSON.stringify(text)}`,
					);
				},
			),
		);
	});

	it("parses and formats lists of cards", () => {
		const cards = parseCards("  As Kd\t7h\n2c ");
		expect(cards).toEqual([51, 45, 22, 0]);
		expect(formatCards(cards)).toBe("As Kd 7h 2c");
		expect(parseCards("")).toEqual([]);
		expect(() => parseCards("As K")).toThrow('Not a card: "K"');
	});

	it("recognises exactly the integers 0 to 51 as cards", () => {
		expect(fullDeck().every(isCard)).toBe(true);
		for (const value of [-1, 52, 1.5, Number.NaN, "0", null, undefined, 51n]) {
			expect(isCard(value)).toBe(false);
		}
		fc.assert(
			fc.property(fc.integer(), (value) => {
				expect(isCard(value)).toBe(value >= 0 && value < CARD_COUNT);
			}),
		);
	});
});
