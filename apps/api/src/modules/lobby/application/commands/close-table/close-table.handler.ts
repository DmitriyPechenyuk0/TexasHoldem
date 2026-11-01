import { CommandBus, CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { ExecuteTableCommand } from "@/modules/table/index.js";
import {
	LobbyTableNotFoundError,
	NotCreatorError,
	TableNotEmptyError,
} from "../../../domain/lobby-errors.js";
import { LobbyTableRepository } from "../../../domain/lobby-table.repository.js";
import { CloseTableCommand } from "./close-table.command.js";

@CommandHandler(CloseTableCommand)
export class CloseTableHandler implements ICommandHandler<CloseTableCommand> {
	constructor(
		private readonly tables: LobbyTableRepository,
		private readonly commandBus: CommandBus,
	) {}

	async execute({ tableId, userId }: CloseTableCommand): Promise<void> {
		const table = await this.tables.findById(tableId);
		if (!table || table.status !== "open") {
			throw new LobbyTableNotFoundError();
		}
		if (table.creatorId !== userId) {
			throw new NotCreatorError();
		}
		if (table.players.length > 0) {
			throw new TableNotEmptyError();
		}
		await this.commandBus.execute(
			new ExecuteTableCommand(tableId, { type: "CloseTable" }, { userId }),
		);
	}
}
