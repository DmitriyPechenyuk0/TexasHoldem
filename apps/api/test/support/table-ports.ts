import { fullDeck } from "@holdem/engine";
import {
	type DealtDeck,
	DeckProvider,
} from "@/modules/table/application/deck-provider.js";

/** The deck in canonical order for every hand, and the button on the first player. */
export class FixedDeckProvider extends DeckProvider {
	readonly dealt: string[] = [];

	async deal(handId: string): Promise<DealtDeck> {
		this.dealt.push(handId);
		return { deck: fullDeck(), buttonDraw: 0 };
	}
}
