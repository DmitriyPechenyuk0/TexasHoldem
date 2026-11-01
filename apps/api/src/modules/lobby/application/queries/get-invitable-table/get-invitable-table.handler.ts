import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import {
	GetInvitableTableQuery,
	type InvitableTable,
} from "@/shared/application/table-invitations.js";
import { mayJoin } from "../../../domain/lobby-table.js";
import { LobbyTableRepository } from "../../../domain/lobby-table.repository.js";
import { listingOf } from "../../lobby-listing.js";
import { TableGrants } from "../../table-grants.js";

/** Answers the social context: a player brings friends only to an open table they may join. */
@QueryHandler(GetInvitableTableQuery)
export class GetInvitableTableHandler implements IQueryHandler<GetInvitableTableQuery> {
	constructor(
		private readonly tables: LobbyTableRepository,
		private readonly grants: TableGrants,
	) {}

	async execute({
		tableId,
		userId,
	}: GetInvitableTableQuery): Promise<InvitableTable | null> {
		const table = await this.tables.findById(tableId);
		if (!table || table.status !== "open") {
			return null;
		}
		const joinable =
			mayJoin(table, userId, false) ||
			(await this.grants.holds(tableId, userId));
		return joinable
			? { ...listingOf(table), visibility: table.visibility }
			: null;
	}
}
