import { bytesToHex, commitServerSeed, fullDeck } from "@holdem/engine";
import {
	type DealtDeck,
	DeckProvider,
} from "@/modules/table/application/deck-provider.js";

/** The server seed of every fixed deal. */
export const FIXED_SEED = new Uint8Array(32).fill(7);

/**
 * The deck in canonical order for every hand, the button on the first player, and a commitment
 * to `FIXED_SEED`, which `reveal` gives back. The deck does not come from the seed: tables check
 * the seed against the commitment only.
 */
export class FixedDeckProvider extends DeckProvider {
	readonly dealt: string[] = [];
	readonly revealed: string[] = [];

	async deal(_tableId: string, handId: string): Promise<DealtDeck> {
		this.dealt.push(handId);
		return {
			deck: fullDeck(),
			buttonDraw: 0,
			commitment: commitServerSeed(FIXED_SEED),
		};
	}

	async reveal(handId: string): Promise<string | null> {
		if (!this.dealt.includes(handId)) return null;
		this.revealed.push(handId);
		return bytesToHex(FIXED_SEED);
	}
}
