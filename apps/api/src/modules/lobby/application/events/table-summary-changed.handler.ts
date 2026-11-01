import { EventBus, EventsHandler, type IEventHandler } from "@nestjs/cqrs";
import { Logger } from "@nestjs/common";
import { TableSummaryChanged } from "@/modules/table/index.js";
import { Clock } from "@/shared/application/clock.js";
import { LobbyTableRepository } from "../../domain/lobby-table.repository.js";
import { LobbyTableChanged } from "./lobby-table-changed.event.js";

/** Keeps the lobby's read model of each table up to date, and tells the lobby's watchers. */
@EventsHandler(TableSummaryChanged)
export class TableSummaryChangedHandler implements IEventHandler<TableSummaryChanged> {
	private readonly logger = new Logger(TableSummaryChangedHandler.name);

	constructor(
		private readonly tables: LobbyTableRepository,
		private readonly eventBus: EventBus,
		private readonly clock: Clock,
	) {}

	async handle(summary: TableSummaryChanged): Promise<void> {
		try {
			const table = await this.tables.applySummary(summary, this.clock.now());
			if (table) {
				this.eventBus.publish(new LobbyTableChanged(table));
			}
		} catch (error) {
			// The table has moved on already; its next summary sets the lobby right.
			this.logger.error({
				msg: "lobby not updated",
				tableId: summary.tableId,
				err: error,
			});
		}
	}
}
