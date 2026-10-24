import { type Card, fullDeck, parseCards } from "../cards/index.js";
import type { HandConfig, HandPlayer } from "../hand/config.js";
import type { HandEvent } from "../hand/events.js";
import { clockwiseFrom } from "../hand/positions.js";

/** Players at seats 0, 1, 2… with 1,000 chips each, named p0, p1, p2… */
export const players = (count: number, stack = 1000): HandPlayer[] =>
	Array.from({ length: count }, (_, seat) => ({
		seat,
		playerId: `p${seat}`,
		stack,
	}));

/** A valid 3-handed 5/10 config with an unshuffled deck; override any part. */
export const handConfig = (
	overrides: Partial<HandConfig> = {},
): HandConfig => ({
	handId: "hand-1",
	smallBlind: 5,
	bigBlind: 10,
	ante: 0,
	buttonSeat: 0,
	players: players(3),
	deck: fullDeck(),
	...overrides,
});

/** The `HandStarted` event a valid config produces. */
export const handStarted = (config: HandConfig = handConfig()): HandEvent => ({
	type: "HandStarted",
	v: 1,
	handId: config.handId,
	smallBlind: config.smallBlind,
	bigBlind: config.bigBlind,
	ante: config.ante,
	buttonSeat: config.buttonSeat,
	players: [...config.players].sort((a, b) => a.seat - b.seat),
	deck: [...config.deck],
});

/**
 * A deck that deals these hole cards and this board, e.g.
 * `riggedDeck({ 0: "As Ad", 1: "Kc Kd" }, "Ah Kh 3c 8d 9s")`. Seats are dealt one card at a time
 * from the left of the button, as `StartHand` does, and each street burns one card first. Burns and
 * every other position take the remaining cards in canonical order.
 */
export function riggedDeck(
	hands: Readonly<Record<number, string>>,
	board: string,
	buttonSeat = 0,
): Card[] {
	const order = clockwiseFrom(
		Object.keys(hands).map((seat) => ({ seat: Number(seat) })),
		buttonSeat,
	);
	const count = order.length;
	const deck = new Map<number, Card>();
	order.forEach(({ seat }, index) => {
		const [first, second] = holeCards(hands[seat] as string);
		deck.set(index, first).set(count + index, second);
	});
	// Flop after one burn, then a burn before the turn and before the river.
	const boardPositions = [1, 2, 3, 5, 7].map((offset) => 2 * count + offset);
	parseCards(board).forEach((card, index) => {
		deck.set(boardPositions[index] as number, card);
	});
	const placed = [...deck.values()];
	if (new Set(placed).size !== placed.length) {
		throw new RangeError("A rigged deck cannot hold the same card twice");
	}
	const rest = fullDeck().filter((card) => !placed.includes(card));
	return Array.from(
		{ length: rest.length + placed.length },
		(_, position) => deck.get(position) ?? (rest.shift() as Card),
	);
}

/** A player's two hole cards from text, e.g. `holeCards("As Kd")`. */
export function holeCards(text: string): readonly [Card, Card] {
	const cards = parseCards(text);
	if (cards.length !== 2) {
		throw new RangeError(
			`Hole cards are two cards, got ${JSON.stringify(text)}`,
		);
	}
	return cards as [Card, Card];
}
