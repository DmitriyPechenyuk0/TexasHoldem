import { TableSummaryChangedV1 } from "@holdem/shared/events";
import type { IEvent } from "@nestjs/cqrs";
import { IntegrationEvent } from "@/shared/application/integration-events.js";

/**
 * Integration event: who sits at the table and whether it is open, after a change to either, and
 * how many hands ended in that change. The lobby lists tables from it. Published once, on the
 * instance that runs the table; the lobby's projection is in Postgres, so every instance reads it.
 */
@IntegrationEvent({
	name: "table.summary-changed",
	version: 1,
	schema: TableSummaryChangedV1,
	broadcast: false,
})
export class TableSummaryChanged implements IEvent {
	constructor(
		readonly tableId: string,
		readonly status: "open" | "closed",
		readonly players: readonly {
			readonly seat: number;
			readonly userId: string;
		}[],
		readonly handsSettled: number,
	) {}
}
