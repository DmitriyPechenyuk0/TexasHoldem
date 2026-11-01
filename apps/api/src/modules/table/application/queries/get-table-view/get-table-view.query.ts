import type { TableView } from "@holdem/shared/realtime";
import { Query } from "@nestjs/cqrs";

/** The table as this user may see it: from their seat, or as a spectator. */
export class GetTableViewQuery extends Query<TableView> {
	constructor(
		readonly tableId: string,
		readonly userId: string,
	) {
		super();
	}
}
