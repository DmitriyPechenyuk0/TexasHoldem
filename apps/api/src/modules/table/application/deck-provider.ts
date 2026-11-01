import type { Card } from "@holdem/engine";

export interface DealtDeck {
	/** The order the hand deals its cards in. */
	readonly deck: readonly Card[];
	/** A random number that places the button when the table starts over (RULES §3). */
	readonly buttonDraw: number;
	/** The hex SHA-256 of the server seed the deck comes from, published before the deal. */
	readonly commitment: string;
}

/**
 * Port for the randomness of a new hand (ADR-008): a deck shuffled from a fresh server seed, which
 * stays on the server until the hand has ended, and the button draw.
 */
export abstract class DeckProvider {
	abstract deal(tableId: string, handId: string): Promise<DealtDeck>;

	/**
	 * The hand's server seed (hex), now that it has ended; from then on anyone may see it. Null for
	 * a hand this provider did not deal.
	 */
	abstract reveal(handId: string): Promise<string | null>;
}
