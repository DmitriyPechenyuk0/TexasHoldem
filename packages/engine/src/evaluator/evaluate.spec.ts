import fc from "fast-check";
import {
	type Card,
	formatCards,
	fullDeck,
	parseCards,
} from "../cards/index.js";
import { compareHands, evaluateHand, isRoyalFlush } from "./evaluate.js";
import { HAND_CATEGORIES, type HandCategory, scoreHand } from "./score.js";

const hand = (text: string) => evaluateHand(parseCards(text));
/** Compares two players' best hands on a shared board, as at showdown. */
const showdown = (board: string, first: string, second: string) =>
	compareHands(hand(`${board} ${first}`), hand(`${board} ${second}`));

describe("evaluateHand: categories (RULES §11)", () => {
	it.each<[string, HandCategory, string, string]>([
		["As Ks Qs Js Ts", "straight-flush", "A", "As Ks Qs Js Ts"],
		["9h 8h 7h 6h 5h", "straight-flush", "9", "9h 8h 7h 6h 5h"],
		["Qc Qd Qh Qs 7d", "four-of-a-kind", "Q 7", "Qs Qh Qd Qc 7d"],
		["Ks Kd Kc 4h 4s", "full-house", "K 4", "Ks Kd Kc 4s 4h"],
		["Ad Jd 8d 6d 2d", "flush", "A J 8 6 2", "Ad Jd 8d 6d 2d"],
		["Tc 9d 8s 7h 6c", "straight", "T", "Tc 9d 8s 7h 6c"],
		["7s 7h 7d Kc 2s", "three-of-a-kind", "7 K 2", "7s 7h 7d Kc 2s"],
		["Jh Jc 5s 5d Ah", "two-pair", "J 5 A", "Jh Jc 5s 5d Ah"],
		["9s 9c Ad Qh 4c", "pair", "9 A Q 4", "9s 9c Ad Qh 4c"],
		["Ac Qd 9s 6h 3c", "high-card", "A Q 9 6 3", "Ac Qd 9s 6h 3c"],
	])("%s is %s", (cards, category, ranks, best) => {
		const value = hand(cards);
		expect(value.category).toBe(category);
		expect(value.ranks.join(" ")).toBe(ranks);
		expect(formatCards(value.cards)).toBe(best);
	});

	it("calls the ace-high straight flush a royal flush", () => {
		expect(isRoyalFlush(hand("As Ks Qs Js Ts 2c 3d"))).toBe(true);
		expect(isRoyalFlush(hand("Ks Qs Js Ts 9s"))).toBe(false);
		expect(isRoyalFlush(hand("Ac Ad Ah As Ks"))).toBe(false);
	});

	it("orders the categories from high card to straight flush", () => {
		const examples = [
			"Ac Qd 9s 6h 3c",
			"9s 9c Ad Qh 4c",
			"Jh Jc 5s 5d Ah",
			"7s 7h 7d Kc 2s",
			"Tc 9d 8s 7h 6c",
			"Ad Jd 8d 6d 2d",
			"Ks Kd Kc 4h 4s",
			"Qc Qd Qh Qs 7d",
			"9h 8h 7h 6h 5h",
		].map(hand);
		expect(examples.map((value) => value.category)).toEqual([
			...HAND_CATEGORIES,
		]);
		for (let index = 1; index < examples.length; index++) {
			expect(compareHands(examples[index]!, examples[index - 1]!)).toBe(1);
		}
	});
});

describe("evaluateHand: straights", () => {
	it("plays the ace low only in the wheel, a five-high straight", () => {
		const wheel = hand("Ad 2c 3h 4s 5d");
		expect(wheel.category).toBe("straight");
		expect(wheel.ranks).toEqual(["5"]);
		expect(formatCards(wheel.cards)).toBe("5d 4s 3h 2c Ad");
		expect(compareHands(wheel, hand("2c 3h 4s 5d 6c"))).toBe(-1);
		expect(compareHands(wheel, hand("As Ks Kd 2h 3s"))).toBe(1);
	});

	it("tops out at broadway and never wraps around the ace", () => {
		expect(hand("Ac Kd Qh Js Td").ranks).toEqual(["A"]);
		expect(hand("Qc Kd Ah 2s 3d").category).toBe("high-card");
	});

	it("finds a straight flush wheel and prefers the highest straight in 7 cards", () => {
		const steelWheel = hand("Ah 2h 3h 4h 5h Kc Qd");
		expect(steelWheel.category).toBe("straight-flush");
		expect(steelWheel.ranks).toEqual(["5"]);
		expect(hand("4c 5d 6h 7s 8c 9d Td").ranks).toEqual(["T"]);
	});

	it("takes the straight flush over a higher plain straight", () => {
		const value = hand("5h 6h 7h 8h 9h Tc Jd");
		expect(value.category).toBe("straight-flush");
		expect(formatCards(value.cards)).toBe("9h 8h 7h 6h 5h");
	});
});

describe("evaluateHand: best five of seven", () => {
	it("keeps the five highest cards of a six-card flush", () => {
		const value = hand("Ah Th 8h 6h 4h 2h Ks");
		expect(value.category).toBe("flush");
		expect(formatCards(value.cards)).toBe("Ah Th 8h 6h 4h");
	});

	it("makes a full house from two sets: the lower set plays as the pair", () => {
		const value = hand("Ks Kd Kc 7h 7s 7d 2c");
		expect(value.category).toBe("full-house");
		expect(value.ranks).toEqual(["K", "7"]);
		expect(formatCards(value.cards)).toBe("Ks Kd Kc 7s 7h");
	});

	it("fills a full house with the highest of two pairs", () => {
		expect(hand("5s 5d 5c 9h 9s Qd Qc").ranks).toEqual(["5", "Q"]);
	});

	it("takes the kicker of two pair from a third pair when it is the highest", () => {
		const value = hand("As Ad Ks Kd Qs Qd 2c");
		expect(value.category).toBe("two-pair");
		expect(value.ranks).toEqual(["A", "K", "Q"]);
	});

	it("takes the best kicker for four of a kind, even from a pair", () => {
		expect(hand("9c 9d 9h 9s Kc Kd 2s").ranks).toEqual(["9", "K"]);
	});
});

describe("compareHands: tie-breakers (RULES §12)", () => {
	it.each([
		["straight flush: highest card", "Ts 9s 8s 7s 6s", "9h 8h 7h 6h 5h"],
		["four of a kind: rank", "8c 8d 8h 8s 2c", "7c 7d 7h 7s Ac"],
		["four of a kind: kicker", "8c 8d 8h 8s 3c", "8c 8d 8h 8s 2c"],
		["full house: rank of the set", "3c 3d 3h 2s 2c", "2d 2h 2s Ac Ad"],
		["full house: rank of the pair", "Kc Kd Kh 9s 9c", "Kc Kd Kh 8s 8c"],
		["flush: highest card", "Ad 7d 5d 4d 2d", "Kh Qh Jh 9h 8h"],
		["flush: down to the fifth card", "Ad Jd 8d 6d 3d", "Ah Jh 8h 6h 2h"],
		["straight: highest card", "6c 5d 4h 3s 2c", "5c 4d 3h 2s Ac"],
		["three of a kind: rank", "Qc Qd Qh 3s 2c", "Jc Jd Jh As Kc"],
		["three of a kind: first kicker", "Qc Qd Qh As 2c", "Qc Qd Qh Ks Jc"],
		["three of a kind: second kicker", "Qc Qd Qh As 4c", "Qc Qd Qh As 3c"],
		["two pair: higher pair", "Kc Kd 3h 3s 2c", "Qc Qd Jh Js Ac"],
		["two pair: lower pair", "Kc Kd 5h 5s 2c", "Kc Kd 4h 4s Ac"],
		["two pair: kicker", "Kc Kd 5h 5s 9c", "Kc Kd 5h 5s 8c"],
		["one pair: rank", "Tc Td 3h 4s 2c", "9c 9d Ah Ks Qc"],
		["one pair: first kicker", "Tc Td Ah 4s 2c", "Tc Td Kh Qs Jc"],
		["one pair: second kicker", "Tc Td Ah Ks 2c", "Tc Td Ah Qs Jc"],
		["one pair: third kicker", "Tc Td Ah Ks 3c", "Tc Td Ah Ks 2c"],
		["high card: down to the fifth card", "Ac Qd 9h 6s 3c", "Ac Qd 9h 6s 2c"],
	])("%s", (_, winner, loser) => {
		expect(compareHands(hand(winner), hand(loser))).toBe(1);
		expect(compareHands(hand(loser), hand(winner))).toBe(-1);
	});

	it("never breaks a tie by suit", () => {
		expect(compareHands(hand("Ah Jh 8h 6h 2h"), hand("As Js 8s 6s 2s"))).toBe(
			0,
		);
		expect(compareHands(hand("Tc 9d 8s 7h 6c"), hand("Th 9h 8d 7c 6s"))).toBe(
			0,
		);
	});

	it("counts only five cards: a sixth or seventh never breaks a tie", () => {
		expect(showdown("Ac Kd Qh Js 9c", "8d 7h", "3s 2d")).toBe(0);
	});

	// The worked examples of RULES §12.
	it("lets the kicker decide", () => {
		expect(showdown("Ks 9d 7c 4h 2s", "Kd Qc", "Kh Jd")).toBe(1);
	});

	it("splits when both players play the board", () => {
		expect(showdown("As Ad Kc Kh Qs", "Jc 9c", "5d 3h")).toBe(0);
		expect(formatCards(hand("As Ad Kc Kh Qs Jc 9c").cards)).toBe(
			"As Ad Kh Kc Qs",
		);
		// With J-T instead, broadway beats the board's two pair.
		expect(hand("As Ad Kc Kh Qs Jc Tc").category).toBe("straight");
	});

	it("counterfeits a pair that no longer makes the best five", () => {
		expect(showdown("8s 8d 5c 5h Ks", "3c 3d", "Ah 2c")).toBe(-1);
		expect(hand("8s 8d 5c 5h Ks 3c 3d").ranks).toEqual(["8", "5", "K"]);
	});

	it("puts a flush above a straight", () => {
		expect(showdown("9h 8h 7c 2h Ks", "Td 6s", "Ah 3h")).toBe(-1);
	});
});

describe("scoreHand", () => {
	it.each([[4], [8]])("rejects %i cards", (count) => {
		expect(() => scoreHand(fullDeck().slice(0, count))).toThrow(RangeError);
	});

	it("rejects a repeated card", () => {
		expect(() => scoreHand(parseCards("As As Kd Qh Jc"))).toThrow(RangeError);
	});

	/** All `size`-card subsets of `cards`. */
	function* subsets(
		cards: readonly Card[],
		size: number,
		from = 0,
	): Generator<Card[]> {
		if (size === 0) {
			yield [];
			return;
		}
		for (let index = from; index <= cards.length - size; index++) {
			for (const rest of subsets(cards, size - 1, index + 1)) {
				yield [cards[index]!, ...rest];
			}
		}
	}

	it("scores 6 and 7 cards as their best five-card subset", () => {
		fc.assert(
			fc.property(
				fc.uniqueArray(fc.integer({ min: 0, max: 51 }), {
					minLength: 6,
					maxLength: 7,
				}),
				(codes) => {
					const cards = codes as Card[];
					const best = Math.max(...Array.from(subsets(cards, 5), scoreHand));
					expect(scoreHand(cards)).toBe(best);
				},
			),
			{ numRuns: 3000 },
		);
	});

	it("does not depend on the order of the cards", () => {
		fc.assert(
			fc.property(
				fc
					.uniqueArray(fc.integer({ min: 0, max: 51 }), {
						minLength: 5,
						maxLength: 7,
					})
					.chain((codes) =>
						fc.tuple(
							fc.constant(codes),
							fc.shuffledSubarray(codes, { minLength: codes.length }),
						),
					),
				([codes, shuffled]) => {
					expect(scoreHand(shuffled as Card[])).toBe(
						scoreHand(codes as Card[]),
					);
				},
			),
		);
	});

	it(
		"ranks all 2,598,960 five-card hands into the 7,462 known classes",
		{ tags: ["slow"], timeout: 120_000 },
		() => {
			const perCategory = new Map<HandCategory, number>();
			const distinct = new Map<HandCategory, Set<number>>();
			const five = new Array<Card>(5);
			for (let a = 0; a < 52; a++)
				for (let b = a + 1; b < 52; b++)
					for (let c = b + 1; c < 52; c++)
						for (let d = c + 1; d < 52; d++)
							for (let e = d + 1; e < 52; e++) {
								five[0] = a as Card;
								five[1] = b as Card;
								five[2] = c as Card;
								five[3] = d as Card;
								five[4] = e as Card;
								const score = scoreHand(five);
								const category = HAND_CATEGORIES[score >> 20]!;
								perCategory.set(category, (perCategory.get(category) ?? 0) + 1);
								let scores = distinct.get(category);
								if (!scores) distinct.set(category, (scores = new Set()));
								scores.add(score);
							}

			// RULES §11: how many five-card hands fall in each category…
			expect(Object.fromEntries(perCategory)).toEqual({
				"straight-flush": 40,
				"four-of-a-kind": 624,
				"full-house": 3744,
				flush: 5108,
				straight: 10_200,
				"three-of-a-kind": 54_912,
				"two-pair": 123_552,
				pair: 1_098_240,
				"high-card": 1_302_540,
			});
			// …and into how many classes of equal strength each one splits.
			expect(
				Object.fromEntries(
					[...distinct].map(([name, scores]) => [name, scores.size]),
				),
			).toEqual({
				"straight-flush": 10,
				"four-of-a-kind": 156,
				"full-house": 156,
				flush: 1277,
				straight: 10,
				"three-of-a-kind": 858,
				"two-pair": 858,
				pair: 2860,
				"high-card": 1277,
			});
		},
	);
});
