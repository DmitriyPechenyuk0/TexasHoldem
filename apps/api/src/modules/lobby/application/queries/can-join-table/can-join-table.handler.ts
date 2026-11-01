import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { CanJoinTableQuery } from "@/shared/application/table-access.js";
import { mayJoin } from "../../../domain/lobby-table.js";
import { LobbyTableRepository } from "../../../domain/lobby-table.repository.js";
import { TableGrants } from "../../table-grants.js";

/**
 * Answers the table context's access check. A table the lobby does not list (dev tables) is open
 * to all; the table itself refuses a closed or unknown one.
 */
@QueryHandler(CanJoinTableQuery)
export class CanJoinTableHandler implements IQueryHandler<CanJoinTableQuery> {
	constructor(
		private readonly tables: LobbyTableRepository,
		private readonly grants: TableGrants,
	) {}

	async execute({ tableId, userId }: CanJoinTableQuery): Promise<boolean> {
		const table = await this.tables.findById(tableId);
		if (!table) {
			return true;
		}
		const open = mayJoin(table, userId, false);
		return open || this.grants.holds(tableId, userId);
	}
}
