import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { and, desc, eq, sql } from "drizzle-orm";
import {
	ListOpenTablesQuery,
	type OpenTableSummary,
} from "@/shared/application/open-tables.js";
import {
	type Database,
	InjectDatabase,
} from "@/shared/infrastructure/database/index.js";
import { toLobbyTable } from "../../../infrastructure/persistence/rows.js";
import { lobbyTables } from "../../../infrastructure/persistence/schema.js";
import { listingOf } from "../../lobby-listing.js";

/** Answers the admin context: every open table, private ones included. */
@QueryHandler(ListOpenTablesQuery)
export class ListOpenTablesHandler implements IQueryHandler<ListOpenTablesQuery> {
	constructor(@InjectDatabase() private readonly db: Database) {}

	async execute({
		playerId,
	}: ListOpenTablesQuery): Promise<readonly OpenTableSummary[]> {
		const rows = await this.db
			.select()
			.from(lobbyTables)
			.where(
				and(
					eq(lobbyTables.status, "open"),
					playerId === undefined
						? undefined
						: sql`${lobbyTables.players} @> ${JSON.stringify([{ userId: playerId }])}::jsonb`,
				),
			)
			.orderBy(desc(lobbyTables.createdAt));
		return rows.map((row) => {
			const table = toLobbyTable(row);
			const { smallBlind, bigBlind } = listingOf(table);
			return {
				tableId: table.id,
				name: table.name,
				visibility: table.visibility,
				presetId: table.presetId,
				smallBlind,
				bigBlind,
				maxSeats: table.maxSeats,
				creatorId: table.creatorId,
				players: table.players,
				handsPlayed: table.handsPlayed,
				createdAt: table.createdAt,
			};
		});
	}
}
