import { randomBytes, randomInt } from "node:crypto";
import { deriveHandSeed, MIN_SEED_BYTES, shuffleDeck } from "@holdem/engine";
import { Injectable } from "@nestjs/common";
import { type DealtDeck, DeckProvider } from "../application/deck-provider.js";

/** Any bound works: the table takes the draw modulo the number of players. */
const MAX_BUTTON_DRAW = 2 ** 32;

/**
 * Shuffles each hand from a fresh random server seed (ADR-008). The seed is not kept yet: storing
 * it, committing to it before the deal and revealing it after is POK-86.
 */
@Injectable()
export class RandomDeckProvider extends DeckProvider {
	async deal(handId: string): Promise<DealtDeck> {
		const serverSeed = randomBytes(MIN_SEED_BYTES);
		return {
			deck: shuffleDeck(deriveHandSeed(serverSeed, handId)),
			buttonDraw: randomInt(MAX_BUTTON_DRAW),
		};
	}
}
