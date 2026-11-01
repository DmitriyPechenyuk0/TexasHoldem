import { randomBytes, randomInt } from "node:crypto";
import {
	bytesToHex,
	commitServerSeed,
	deriveHandSeed,
	MIN_SEED_BYTES,
	shuffleDeck,
} from "@holdem/engine";
import { Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import {
	type Database,
	InjectDatabase,
} from "@/shared/infrastructure/database/index.js";
import { type DealtDeck, DeckProvider } from "../application/deck-provider.js";
import { handDecks } from "./persistence/schema.js";

/** Any bound works: the table takes the draw modulo the number of players. */
const MAX_BUTTON_DRAW = 2 ** 32;

/** 32 bytes, twice the engine's minimum. */
const SEED_BYTES = Math.max(32, MIN_SEED_BYTES);

/**
 * Shuffles each hand from a fresh server seed out of the CSPRNG (ADR-008), keeps the seed in
 * `table_hand_decks` until the hand has ended, and gives the commitment to publish before the
 * deal. No client seeds yet: they would only bind the server if chosen after its commitment.
 */
@Injectable()
export class SeededDeckProvider extends DeckProvider {
	constructor(@InjectDatabase() private readonly db: Database) {
		super();
	}

	async deal(tableId: string, handId: string): Promise<DealtDeck> {
		const serverSeed = randomBytes(SEED_BYTES);
		const commitment = commitServerSeed(serverSeed);
		await this.db.insert(handDecks).values({
			handId,
			tableId,
			serverSeed: bytesToHex(serverSeed),
			commitment,
		});
		return {
			deck: shuffleDeck(deriveHandSeed(serverSeed, handId)),
			buttonDraw: randomInt(MAX_BUTTON_DRAW),
			commitment,
		};
	}

	async reveal(handId: string): Promise<string | null> {
		const [row] = await this.db
			.update(handDecks)
			.set({ revealedAt: new Date() })
			.where(eq(handDecks.handId, handId))
			.returning({ serverSeed: handDecks.serverSeed });
		return row?.serverSeed ?? null;
	}
}
