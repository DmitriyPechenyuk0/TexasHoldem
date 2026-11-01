import { type HandEvent, replayHand } from "@holdem/engine";
import type { HandFairnessResponse } from "@holdem/shared/contracts/table";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { eq } from "drizzle-orm";
import { EventStore } from "@/shared/application/event-store.js";
import {
	type Database,
	InjectDatabase,
} from "@/shared/infrastructure/database/index.js";
import {
	DeckNotRevealedError,
	HandNotFoundError,
} from "../../../domain/table-errors.js";
import { handDecks } from "../../../infrastructure/persistence/schema.js";
import { handStream, type TableStreamEvent } from "../../game-streams.js";
import { GetHandFairnessQuery } from "./get-hand-fairness.query.js";

/**
 * Reads the revealed seed and the hand's deal. Refused while the hand is being played: until it
 * ends, the seed and the deck are as secret as the cards still to come.
 */
@QueryHandler(GetHandFairnessQuery)
export class GetHandFairnessHandler implements IQueryHandler<GetHandFairnessQuery> {
	constructor(
		@InjectDatabase() private readonly db: Database,
		private readonly events: EventStore<TableStreamEvent>,
	) {}

	async execute({
		handId,
	}: GetHandFairnessQuery): Promise<HandFairnessResponse> {
		const [deck] = await this.db
			.select()
			.from(handDecks)
			.where(eq(handDecks.handId, handId));
		if (!deck) {
			throw new HandNotFoundError();
		}
		if (!deck.revealedAt) {
			throw new DeckNotRevealedError();
		}
		const recorded = await this.events.readStream(handStream(handId));
		const hand = replayHand(recorded.map(({ event }) => event as HandEvent));
		return {
			handId: handId as HandFairnessResponse["handId"],
			commitment: deck.commitment,
			serverSeed: deck.serverSeed,
			clientSeeds: [],
			// The cards taken off the top, burns included, in order.
			dealtCards:
				hand.status === "idle" ? [] : hand.deck.slice(0, hand.nextCard),
		};
	}
}
