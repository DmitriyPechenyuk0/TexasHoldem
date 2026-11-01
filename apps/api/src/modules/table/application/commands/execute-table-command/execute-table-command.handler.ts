import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import type { GameEvents } from "../../../domain/game.js";
import { TableRuntimeRegistry } from "../../runtime/table-runtime-registry.js";
import { ExecuteTableCommand } from "./execute-table-command.command.js";

/** Queues the command in the table's runtime, which runs one command at a time. */
@CommandHandler(ExecuteTableCommand)
export class ExecuteTableCommandHandler implements ICommandHandler<ExecuteTableCommand> {
	constructor(private readonly runtimes: TableRuntimeRegistry) {}

	execute({
		tableId,
		command,
		metadata,
	}: ExecuteTableCommand): Promise<GameEvents> {
		return this.runtimes.get(tableId).execute(command, metadata);
	}
}
