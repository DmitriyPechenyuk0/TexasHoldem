import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";
import { IntegrationEventBus } from "@/shared/application/integration-events.js";
import type { TableEventType } from "../../domain/table-events.js";
import { TableChanged } from "./table-changed.event.js";
import { TableSummaryChanged } from "./table-summary-changed.event.js";

/** Table events that change what the lobby shows of a table. */
const SUMMARY_EVENTS: ReadonlySet<TableEventType> = new Set([
	"TableOpened",
	"SeatTaken",
	"SeatLeft",
	"HandSettled",
	"TableClosed",
]);

/** Tells other contexts how a table changed, as a summary with nothing secret in it. */
@EventsHandler(TableChanged)
export class PublishTableSummaryHandler implements IEventHandler<TableChanged> {
	constructor(private readonly events: IntegrationEventBus) {}

	handle({ tableId, events, state }: TableChanged): void {
		const { table } = state;
		if (
			table.status === "unopened" ||
			!events.table.some(({ type }) => SUMMARY_EVENTS.has(type))
		) {
			return;
		}
		this.events.publish(
			new TableSummaryChanged(
				tableId,
				table.status,
				table.players.map(({ seat, userId }) => ({ seat, userId })),
				events.table.filter(({ type }) => type === "HandSettled").length,
			),
		);
	}
}
