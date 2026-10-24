/** Ranks from lowest to highest (RULES §2). `T` is the ten. */
export const RANKS = [
	"2",
	"3",
	"4",
	"5",
	"6",
	"7",
	"8",
	"9",
	"T",
	"J",
	"Q",
	"K",
	"A",
] as const;
export type Rank = (typeof RANKS)[number];

/**
 * Suits in draw order, lowest first: clubs, diamonds, hearts, spades (TDA Addendum, Rule 10).
 * Suits never rank hands; only draws for seats use this order.
 */
export const SUITS = ["c", "d", "h", "s"] as const;
export type Suit = (typeof SUITS)[number];

declare const cardBrand: unique symbol;

/**
 * One of the 52 cards, encoded as `rankIndex * 4 + suitIndex` (0 = 2c, 51 = As). The number
 * orders cards by rank, then suit, which is also the order of a draw for seats. Only the
 * functions of this module create cards, so any `Card` is a valid one.
 */
export type Card = number & { readonly [cardBrand]: true };

/** The text form of a card: rank then suit, e.g. `As`, `Td`, `2c`. */
export type CardText = `${Rank}${Suit}`;

export const CARD_COUNT = 52;

export const isCard = (value: unknown): value is Card =>
	Number.isInteger(value) &&
	(value as number) >= 0 &&
	(value as number) < CARD_COUNT;

export const card = (rank: Rank, suit: Suit): Card =>
	(RANKS.indexOf(rank) * SUITS.length + SUITS.indexOf(suit)) as Card;

/** 0 for a deuce up to 12 for an ace: the index into `RANKS`. */
export const rankIndexOf = (card: Card): number => card >> 2;

/** 0 for clubs up to 3 for spades: the index into `SUITS`. */
export const suitIndexOf = (card: Card): number => card & 3;

export const rankOf = (card: Card): Rank => RANKS[rankIndexOf(card)] as Rank;

export const suitOf = (card: Card): Suit => SUITS[suitIndexOf(card)] as Suit;

export const formatCard = (card: Card): CardText =>
	`${rankOf(card)}${suitOf(card)}`;

/**
 * Reads the text form, strictly: an upper-case rank and a lower-case suit, so every card has
 * exactly one spelling. Throws a `RangeError` for anything else.
 */
export function parseCard(text: string): Card {
	const rank = RANKS.indexOf(text[0] as Rank);
	const suit = SUITS.indexOf(text[1] as Suit);
	if (text.length !== 2 || rank < 0 || suit < 0) {
		throw new RangeError(`Not a card: ${JSON.stringify(text)}`);
	}
	return (rank * SUITS.length + suit) as Card;
}

/** Reads cards separated by whitespace, e.g. `"As Kd 7h"`. Throws on the first invalid one. */
export const parseCards = (text: string): Card[] =>
	text.split(/\s+/).filter(Boolean).map(parseCard);

export const formatCards = (cards: readonly Card[]): string =>
	cards.map(formatCard).join(" ");
