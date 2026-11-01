import { fullDeck } from "@holdem/engine";
import {
	type DealtDeck,
	DeckProvider,
} from "@/modules/table/application/deck-provider.js";
import { HandScheduler } from "@/modules/table/application/hand-scheduler.js";

/** Records the tables it was asked to deal; deals nothing itself. */
export class RecordingHandScheduler extends HandScheduler {
	readonly scheduled: string[] = [];

	schedule(tableId: string): void {
		this.scheduled.push(tableId);
	}
}

/** The deck in canonical order for every hand, and the button on the first player. */
export class FixedDeckProvider extends DeckProvider {
	readonly dealt: string[] = [];

	async deal(handId: string): Promise<DealtDeck> {
		this.dealt.push(handId);
		return { deck: fullDeck(), buttonDraw: 0 };
	}
}
