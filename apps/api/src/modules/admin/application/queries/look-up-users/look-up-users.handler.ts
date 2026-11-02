import { type IQueryHandler, QueryBus, QueryHandler } from "@nestjs/cqrs";
import { FindAccountsQuery } from "@/shared/application/accounts.js";
import { ListOpenTablesQuery } from "@/shared/application/open-tables.js";
import { GetPlayerCardsQuery } from "@/shared/application/player-directory.js";
import { LookUpUsersQuery, type UserDetails } from "./look-up-users.query.js";

/** Identity's accounts, with the profile's nickname and the lobby's tables of each. */
@QueryHandler(LookUpUsersQuery)
export class LookUpUsersHandler implements IQueryHandler<LookUpUsersQuery> {
	constructor(private readonly queryBus: QueryBus) {}

	async execute({ search }: LookUpUsersQuery): Promise<readonly UserDetails[]> {
		const accounts = await this.queryBus.execute(new FindAccountsQuery(search));
		const cards = await this.queryBus.execute(
			new GetPlayerCardsQuery(accounts.map(({ userId }) => userId)),
		);
		const nicknameOf = new Map(
			cards.map(({ userId, nickname }) => [userId, nickname]),
		);
		return Promise.all(
			accounts.map(async (account) => {
				const tables = await this.queryBus.execute(
					new ListOpenTablesQuery(account.userId),
				);
				return {
					...account,
					nickname: nicknameOf.get(account.userId) ?? null,
					tables: tables.map(({ tableId, name, players }) => ({
						tableId,
						name,
						// Listed because the user sits there.
						seat: players.find(({ userId }) => userId === account.userId)!.seat,
					})),
				};
			}),
		);
	}
}
