import type { Card } from "../cards/index.js";

/** Hand categories from weakest to strongest (RULES §11). A royal flush is the ace-high straight flush. */
export const HAND_CATEGORIES = [
	"high-card",
	"pair",
	"two-pair",
	"three-of-a-kind",
	"straight",
	"flush",
	"full-house",
	"four-of-a-kind",
	"straight-flush",
] as const;
export type HandCategory = (typeof HAND_CATEGORIES)[number];

/**
 * The strength of a hand as one number: a higher score wins, equal scores split (RULES §12).
 * Bits 20+ hold the category index; bits 0–19 hold five rank indices (4 bits each) in the order
 * they are compared, e.g. a full house K-K-K-7-7 stores K, K, K, 7, 7.
 */
export type HandScore = number;

const HIGH_CARD = 0;
const PAIR = 1;
const TWO_PAIR = 2;
const THREE_OF_A_KIND = 3;
const STRAIGHT = 4;
const FLUSH = 5;
const FULL_HOUSE = 6;
const FOUR_OF_A_KIND = 7;
const STRAIGHT_FLUSH = 8;

const CATEGORY_SHIFT = 20;
const ACE = 12;

// Scratch space reused by every call: scoring allocates nothing.
const suitMasks = new Int32Array(4);
const rankCounts = new Int32Array(13);

const pack = (
	category: number,
	r1: number,
	r2: number,
	r3: number,
	r4: number,
	r5: number,
) =>
	(category << CATEGORY_SHIFT) |
	(r1 << 16) |
	(r2 << 12) |
	(r3 << 8) |
	(r4 << 4) |
	r5;

const highestBit = (mask: number) => 31 - Math.clz32(mask);

function bitCount(mask: number): number {
	let count = 0;
	for (let rest = mask; rest !== 0; rest &= rest - 1) {
		count++;
	}
	return count;
}

/** The high card of the best straight in a rank mask, or -1. The ace also plays low (A-2-3-4-5). */
function straightHigh(mask: number): number {
	// Bit 0 is a low ace, bits 1..13 are 2..A.
	const withLowAce = (mask << 1) | (mask >> ACE);
	const runs =
		withLowAce &
		(withLowAce >> 1) &
		(withLowAce >> 2) &
		(withLowAce >> 3) &
		(withLowAce >> 4);
	// A run starting at bit b ends at bit b + 4, which is rank index b + 3.
	return runs === 0 ? -1 : highestBit(runs) + 3;
}

/** The ranks of a straight from its high card down; the wheel ends with the ace. */
const straightScore = (category: number, high: number) =>
	pack(
		category,
		high,
		high - 1,
		high - 2,
		high - 3,
		high === 3 ? ACE : high - 4,
	);

/** Packs the `count` highest ranks of `mask` after `prefix` (already shifted into place). */
function withKickers(prefix: number, mask: number, count: number): number {
	let score = prefix;
	let rest = mask;
	for (let slot = count - 1; slot >= 0; slot--) {
		const rank = highestBit(rest);
		score |= rank << (slot * 4);
		rest &= ~(1 << rank);
	}
	return score;
}

/**
 * Scores the best five-card hand among 5 to 7 cards. Only five cards ever count; suits never
 * break ties. Throws a `RangeError` for fewer than 5 or more than 7 cards, or a repeated card.
 */
export function scoreHand(cards: readonly Card[]): HandScore {
	const count = cards.length;
	if (count < 5 || count > 7) {
		throw new RangeError(`A hand is scored from 5 to 7 cards, got ${count}`);
	}
	suitMasks.fill(0);
	rankCounts.fill(0);
	for (let index = 0; index < count; index++) {
		const card = cards[index] as Card;
		const bit = 1 << (card >> 2);
		const suit = card & 3;
		if ((suitMasks[suit] as number) & bit) {
			throw new RangeError(`A hand cannot hold the same card twice: ${card}`);
		}
		suitMasks[suit] = (suitMasks[suit] as number) | bit;
		rankCounts[card >> 2] = (rankCounts[card >> 2] as number) + 1;
	}

	// With at most 7 cards a flush rules out four of a kind and a full house, so it is the best
	// hand unless it is also a straight flush.
	for (let suit = 0; suit < 4; suit++) {
		const flush = suitMasks[suit] as number;
		if (bitCount(flush) >= 5) {
			const high = straightHigh(flush);
			return high >= 0
				? straightScore(STRAIGHT_FLUSH, high)
				: withKickers(FLUSH << CATEGORY_SHIFT, flush, 5);
		}
	}

	let quads = -1;
	let trips = -1;
	let secondTrips = -1;
	let pair = -1;
	let secondPair = -1;
	for (let rank = ACE; rank >= 0; rank--) {
		const n = rankCounts[rank] as number;
		if (n === 4) {
			quads = rank;
		} else if (n === 3) {
			// Seven cards hold at most two sets.
			if (trips < 0) trips = rank;
			else secondTrips = rank;
		} else if (n === 2) {
			if (pair < 0) pair = rank;
			else if (secondPair < 0) secondPair = rank;
		}
	}
	const ranks =
		(suitMasks[0] as number) |
		(suitMasks[1] as number) |
		(suitMasks[2] as number) |
		(suitMasks[3] as number);

	if (quads >= 0) {
		return withKickers(
			pack(FOUR_OF_A_KIND, quads, quads, quads, quads, 0),
			ranks & ~(1 << quads),
			1,
		);
	}
	if (trips >= 0 && (secondTrips >= 0 || pair >= 0)) {
		// Two sets: the lower one plays as the pair. Otherwise the highest pair does.
		const fill = Math.max(secondTrips, pair);
		return pack(FULL_HOUSE, trips, trips, trips, fill, fill);
	}
	const straight = straightHigh(ranks);
	if (straight >= 0) {
		return straightScore(STRAIGHT, straight);
	}
	if (trips >= 0) {
		return withKickers(
			pack(THREE_OF_A_KIND, trips, trips, trips, 0, 0),
			ranks & ~(1 << trips),
			2,
		);
	}
	if (secondPair >= 0) {
		// A third pair can still be the kicker.
		return withKickers(
			pack(TWO_PAIR, pair, pair, secondPair, secondPair, 0),
			ranks & ~(1 << pair) & ~(1 << secondPair),
			1,
		);
	}
	if (pair >= 0) {
		return withKickers(
			pack(PAIR, pair, pair, 0, 0, 0),
			ranks & ~(1 << pair),
			3,
		);
	}
	return withKickers(HIGH_CARD << CATEGORY_SHIFT, ranks, 5);
}

export const categoryOfScore = (score: HandScore): HandCategory =>
	HAND_CATEGORIES[score >> CATEGORY_SHIFT] as HandCategory;

/** The five rank indices of a score, in the order they are compared. */
export const rankIndicesOfScore = (score: HandScore): number[] => [
	(score >> 16) & 0xf,
	(score >> 12) & 0xf,
	(score >> 8) & 0xf,
	(score >> 4) & 0xf,
	score & 0xf,
];
