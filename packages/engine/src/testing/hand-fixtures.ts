import { type Card, fullDeck, parseCards } from "../cards/index.js";
import type { HandConfig, HandPlayer } from "../hand/config.js";
import type { HandEvent } from "../hand/events.js";

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
