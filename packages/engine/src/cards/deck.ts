import { type Card, CARD_COUNT } from "./card.js";

/**
 * A fresh, complete deck in canonical order: 2c 2d 2h 2s 3c … As. Every call returns a new
 * array, so the caller may shuffle it in place.
 */
export const fullDeck = (): Card[] =>
	Array.from({ length: CARD_COUNT }, (_, index) => index as Card);
