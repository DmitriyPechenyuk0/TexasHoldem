import { type IQueryHandler, QueryBus, QueryHandler } from "@nestjs/cqrs";
import { Clock } from "@/shared/application/clock.js";
import { GetPlayerCardsQuery } from "@/shared/application/player-directory.js";
import { GetInvitableTableQuery } from "@/shared/application/table-invitations.js";
import { TableInvites } from "../../table-invites.js";
import {
	GetTableInvitesQuery,
	type TableInviteView,
} from "./get-table-invites.query.js";

@QueryHandler(GetTableInvitesQuery)
export class GetTableInvitesHandler implements IQueryHandler<GetTableInvitesQuery> {
	constructor(
		private readonly invites: TableInvites,
		private readonly queryBus: QueryBus,
		private readonly clock: Clock,
	) {}

	async execute({
		userId,
	}: GetTableInvitesQuery): Promise<readonly TableInviteView[]> {
		const pending = await this.invites.pending(userId, this.clock.now());
		const cards = await this.queryBus.execute(
			new GetPlayerCardsQuery([
				...new Set(pending.map(({ inviterId }) => inviterId)),
			]),
		);
		const byId = new Map(cards.map((card) => [card.userId, card]));
		const views = await Promise.all(
			pending.map(async ({ inviterId, tableId, expiresAt }) => {
				const from = byId.get(inviterId);
				const table = await this.queryBus.execute(
					new GetInvitableTableQuery(tableId, inviterId),
				);
				return from && table ? [{ from, table, expiresAt }] : [];
			}),
		);
		return views.flat();
	}
}
