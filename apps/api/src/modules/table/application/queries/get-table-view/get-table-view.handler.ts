import type { TableView } from "@holdem/shared/realtime";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { TableRuntimeRegistry } from "../../runtime/table-runtime-registry.js";
import { GetTableViewQuery } from "./get-table-view.query.js";

/** Reads the table from its runtime, wherever it runs, after the commands queued before. */
@QueryHandler(GetTableViewQuery)
export class GetTableViewHandler implements IQueryHandler<GetTableViewQuery> {
	constructor(private readonly runtimes: TableRuntimeRegistry) {}

	execute({ tableId, userId }: GetTableViewQuery): Promise<TableView> {
		return this.runtimes.viewFor(tableId, userId);
	}
}
