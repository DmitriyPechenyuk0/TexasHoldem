import {
	type Card,
	RANKS,
	type Rank,
	rankIndexOf,
	suitIndexOf,
} from "../cards/index.js";
import {
	categoryOfScore,
	type HandCategory,
	type HandScore,
	rankIndicesOfScore,
	scoreHand,
} from "./score.js";

export interface HandValue {
	readonly category: HandCategory;
	/** Compare with `compareHands`, or directly: higher wins, equal splits. */
	readonly score: HandScore;
	/** The five cards that make the hand, in the order they are compared (kickers last). */
	readonly cards: readonly Card[];
	/**
	 * The ranks a description names, for the client to localize: a full house K-K-K-7-7 gives
	 * `["K", "7"]` ("Kings full of sevens"), two pair J-J-5-5-A gives `["J", "5", "A"]`, a straight
	 * gives only its high card (`"5"` for the wheel), a flush or high card gives all five.
	 */
	readonly ranks: readonly Rank[];
}

/** The best five-card hand among 5 to 7 cards, e.g. two hole cards and the board. */
export function evaluateHand(cards: readonly Card[]): HandValue {
	const score = scoreHand(cards);
	const category = categoryOfScore(score);
	const rankIndices = rankIndicesOfScore(score);
	const straight = category === "straight" || category === "straight-flush";
	const named = straight
		? rankIndices.slice(0, 1)
		: rankIndices.filter((rank, index) => rank !== rankIndices[index - 1]);

	return {
		category,
		score,
		cards: pickCards(cards, rankIndices, flushSuit(cards, category)),
		ranks: named.map((rank) => RANKS[rank] as Rank),
	};
}

/** -1 if `a` loses to `b`, 1 if it wins, 0 for a split. */
export const compareHands = (a: HandValue, b: HandValue): -1 | 0 | 1 =>
	Math.sign(a.score - b.score) as -1 | 0 | 1;

export const isRoyalFlush = (hand: HandValue): boolean =>
	hand.category === "straight-flush" && hand.ranks[0] === "A";

/** The suit of a flush or straight flush, which every card of the hand must share. */
function flushSuit(
	cards: readonly Card[],
	category: HandCategory,
): number | undefined {
	if (category !== "flush" && category !== "straight-flush") {
		return undefined;
	}
	const perSuit = [0, 0, 0, 0];
	for (const card of cards) {
		perSuit[suitIndexOf(card)]! += 1;
	}
	return perSuit.findIndex((count) => count >= 5);
}

/** For each rank in order, the highest-suited unused card of that rank (and of the flush suit). */
function pickCards(
	cards: readonly Card[],
	rankIndices: readonly number[],
	suit: number | undefined,
): Card[] {
	const pool = cards
		.filter((card) => suit === undefined || suitIndexOf(card) === suit)
		.toSorted((a, b) => b - a);
	return rankIndices.map((rank) => {
		const index = pool.findIndex((card) => rankIndexOf(card) === rank);
		const [card] = pool.splice(index, 1);
		return card as Card;
	});
}
