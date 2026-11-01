import type { TableView } from "@holdem/shared/realtime";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { TableNotOpenError } from "../../../domain/table-errors.js";
import { versionsOf } from "../../game-streams.js";
import { TableRuntimeRegistry } from "../../runtime/table-runtime-registry.js";
import { tableViewFor, viewerAt } from "../../table-views.js";
import { GetTableViewQuery } from "./get-table-view.query.js";

/** Reads the table from its runtime, after the commands queued before, as events go out. */
@QueryHandler(GetTableViewQuery)
export class GetTableViewHandler implements IQueryHandler<GetTableViewQuery> {
	constructor(private readonly runtimes: TableRuntimeRegistry) {}

	async execute({ tableId, userId }: GetTableViewQuery): Promise<TableView> {
		const loaded = await this.runtimes.get(tableId).view();
		const { table } = loaded.state;
		if (table.status === "unopened") {
			throw new TableNotOpenError();
		}
		return tableViewFor(
			loaded.state,
			versionsOf(loaded),
			viewerAt(table, userId),
		);
	}
}
