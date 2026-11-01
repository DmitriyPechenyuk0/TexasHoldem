import type { Card } from "@holdem/engine";

export interface DealtDeck {
	/** The order the hand deals its cards in. */
	readonly deck: readonly Card[];
	/** A random number that places the button when the table starts over (RULES §3). */
	readonly buttonDraw: number;
}

/** Port for the randomness of a new hand: its shuffled deck (ADR-008) and the button draw. */
export abstract class DeckProvider {
	abstract deal(handId: string): Promise<DealtDeck>;
}
