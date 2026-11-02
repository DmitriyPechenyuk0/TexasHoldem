import { type IQueryHandler, QueryBus, QueryHandler } from "@nestjs/cqrs";
import { ListOpenTablesQuery } from "@/shared/application/open-tables.js";
import { GetPlayerCardsQuery } from "@/shared/application/player-directory.js";
import {
	type ActiveTable,
	ListActiveTablesQuery,
} from "./list-active-tables.query.js";

/** The lobby's open tables, with the cards of their creators and players. */
@QueryHandler(ListActiveTablesQuery)
export class ListActiveTablesHandler implements IQueryHandler<ListActiveTablesQuery> {
	constructor(private readonly queryBus: QueryBus) {}

	async execute(): Promise<readonly ActiveTable[]> {
		const tables = await this.queryBus.execute(new ListOpenTablesQuery());
		const userIds = new Set(
			tables.flatMap(({ creatorId, players }) => [
				creatorId,
				...players.map(({ userId }) => userId),
			]),
		);
		const cards = await this.queryBus.execute(
			new GetPlayerCardsQuery([...userIds]),
		);
		const cardOf = new Map(cards.map((card) => [card.userId, card]));
		return tables.map(({ players, ...table }) => ({
			...table,
			creator: cardOf.get(table.creatorId) ?? null,
			seats: players.map(({ seat, userId }) => ({
				seat,
				userId,
				player: cardOf.get(userId) ?? null,
			})),
		}));
	}
}
