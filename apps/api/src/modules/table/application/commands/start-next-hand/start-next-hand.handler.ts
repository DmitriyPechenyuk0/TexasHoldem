import { randomUUID } from "node:crypto";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { EventStore } from "@/shared/application/event-store.js";
import {
	decideGame,
	type GameEvents,
	handReady,
} from "../../../domain/game.js";
import { DeckProvider } from "../../deck-provider.js";
import {
	loadGame,
	saveGame,
	type TableStreamEvent,
} from "../../game-streams.js";
import { HandScheduler } from "../../hand-scheduler.js";
import { StartNextHandCommand } from "./start-next-hand.command.js";

@CommandHandler(StartNextHandCommand)
export class StartNextHandHandler implements ICommandHandler<StartNextHandCommand> {
	constructor(
		private readonly events: EventStore<TableStreamEvent>,
		private readonly decks: DeckProvider,
		private readonly scheduler: HandScheduler,
	) {}

	async execute({ tableId }: StartNextHandCommand): Promise<GameEvents | null> {
		const loaded = await loadGame(this.events, tableId);
		if (!handReady(loaded.state.table)) {
			return null;
		}
		const handId = randomUUID();
		const { deck, buttonDraw } = await this.decks.deal(handId);
		const decision = decideGame(
			{ type: "StartHand", handId, deck, buttonDraw },
			loaded.state,
		);
		if (!decision.ok) {
			throw decision.error;
		}
		const saved = await saveGame(this.events, loaded, decision.value);
		// A hand can end as it is dealt, when the blinds put everyone all-in.
		if (handReady(saved.state.table)) {
			this.scheduler.schedule(tableId);
		}
		return decision.value;
	}
}
