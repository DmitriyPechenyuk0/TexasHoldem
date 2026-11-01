import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import type { GameEvents } from "../../../domain/game.js";
import { TableRuntimeRegistry } from "../../runtime/table-runtime-registry.js";
import { StartNextHandCommand } from "./start-next-hand.command.js";

/** Queues the deal in the table's runtime, which also deals on its own after each pause. */
@CommandHandler(StartNextHandCommand)
export class StartNextHandHandler implements ICommandHandler<StartNextHandCommand> {
	constructor(private readonly runtimes: TableRuntimeRegistry) {}

	execute({ tableId }: StartNextHandCommand): Promise<GameEvents | null> {
		return this.runtimes.get(tableId).dealNextHand();
	}
}
