import type { Card } from "../cards/index.js";
import { bytesToHex } from "./bytes.js";
import { sha256 } from "./sha256.js";
import { deriveHandSeed, shuffleDeck } from "./shuffle.js";

/** Published before the deal: the lower-case hex SHA-256 of the server seed. */
export const commitServerSeed = (serverSeed: Uint8Array): string =>
	bytesToHex(sha256(serverSeed));

export interface DeckVerificationInput {
	/** Revealed after the hand. */
	readonly serverSeed: Uint8Array;
	/** Published before the deal. */
	readonly commitment: string;
	readonly handId: string;
	readonly clientSeeds?: readonly string[];
	/** The cards taken from the top of the deck, in order, as the hand history shows them. */
	readonly dealtCards: readonly Card[];
}

export type DeckVerification =
	| { readonly ok: true; readonly deck: readonly Card[] }
	| { readonly ok: false; readonly reason: "commitment-mismatch" }
	| {
			readonly ok: false;
			readonly reason: "card-mismatch";
			/** Position in the deck of the first card that differs. */
			readonly index: number;
			readonly expected: Card;
			readonly actual: Card;
	  }
	| { readonly ok: false; readonly reason: "too-many-cards" };

/**
 * Checks a finished hand: the revealed server seed matches the commitment published before the
 * deal, and the seeds rebuild a deck that starts with exactly the dealt cards.
 */
export function verifyDeck({
	serverSeed,
	commitment,
	handId,
	clientSeeds = [],
	dealtCards,
}: DeckVerificationInput): DeckVerification {
	if (commitServerSeed(serverSeed) !== commitment.toLowerCase()) {
		return { ok: false, reason: "commitment-mismatch" };
	}
	const deck = shuffleDeck(deriveHandSeed(serverSeed, handId, clientSeeds));
	if (dealtCards.length > deck.length) {
		return { ok: false, reason: "too-many-cards" };
	}
	const index = dealtCards.findIndex(
		(card, position) => card !== deck[position],
	);
	if (index >= 0) {
		return {
			ok: false,
			reason: "card-mismatch",
			index,
			expected: deck[index] as Card,
			actual: dealtCards[index] as Card,
		};
	}
	return { ok: true, deck };
}
