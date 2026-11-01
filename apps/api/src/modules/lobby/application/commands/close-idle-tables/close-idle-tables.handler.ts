import { CommandBus, CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { Logger } from "@nestjs/common";
import { ExecuteTableCommand } from "@/modules/table/index.js";
import { Clock } from "@/shared/application/clock.js";
import { DomainError } from "@/shared/domain/domain-error.js";
import { EMPTY_TABLE_TTL_MS } from "../../../domain/lobby-table.js";
import { LobbyTableRepository } from "../../../domain/lobby-table.repository.js";
import { CloseIdleTablesCommand } from "./close-idle-tables.command.js";

/**
 * Asks the table context to close each table empty for longer than its time to live; the table's
 * summary then removes it from the lobby. A table the table context already closed, or never
 * opened, is marked closed here, so it is not asked again.
 */
@CommandHandler(CloseIdleTablesCommand)
export class CloseIdleTablesHandler implements ICommandHandler<CloseIdleTablesCommand> {
	private readonly logger = new Logger(CloseIdleTablesHandler.name);

	constructor(
		private readonly tables: LobbyTableRepository,
		private readonly commandBus: CommandBus,
		private readonly clock: Clock,
	) {}

	async execute(): Promise<number> {
		const now = this.clock.now().getTime();
		const idle = await this.tables.findEmptySince({
			public: new Date(now - EMPTY_TABLE_TTL_MS.public),
			private: new Date(now - EMPTY_TABLE_TTL_MS.private),
		});
		let closed = 0;
		for (const tableId of idle) {
			try {
				await this.commandBus.execute(
					new ExecuteTableCommand(tableId, { type: "CloseTable" }),
				);
				closed += 1;
			} catch (error) {
				if (
					error instanceof DomainError &&
					(error.code === "table.closed" || error.code === "table.not-open")
				) {
					await this.tables.markClosed(tableId);
					continue;
				}
				// Someone sat down meanwhile, or the table is busy: the next sweep looks again.
				this.logger.warn({ msg: "idle table not closed", tableId, err: error });
			}
		}
		return closed;
	}
}
