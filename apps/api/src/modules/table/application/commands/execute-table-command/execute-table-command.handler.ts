import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { EventStore } from "@/shared/application/event-store.js";
import {
	decideGame,
	type GameEvents,
	handReady,
} from "../../../domain/game.js";
import {
	loadGame,
	saveGame,
	type TableStreamEvent,
} from "../../game-streams.js";
import { HandScheduler } from "../../hand-scheduler.js";
import { ExecuteTableCommand } from "./execute-table-command.command.js";

@CommandHandler(ExecuteTableCommand)
export class ExecuteTableCommandHandler implements ICommandHandler<ExecuteTableCommand> {
	constructor(
		private readonly events: EventStore<TableStreamEvent>,
		private readonly scheduler: HandScheduler,
	) {}

	async execute({
		tableId,
		command,
		metadata,
	}: ExecuteTableCommand): Promise<GameEvents> {
		const loaded = await loadGame(this.events, tableId);
		const decision = decideGame(command, loaded.state);
		if (!decision.ok) {
			throw decision.error;
		}
		const saved = await saveGame(this.events, loaded, decision.value, metadata);
		// A hand ended, or a player got ready: the next hand comes after the pause.
		if (handReady(saved.state.table)) {
			this.scheduler.schedule(tableId);
		}
		return decision.value;
	}
}
