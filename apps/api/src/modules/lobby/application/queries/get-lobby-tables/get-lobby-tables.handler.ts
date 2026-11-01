import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { and, desc, eq, sql } from "drizzle-orm";
import {
	type Database,
	InjectDatabase,
} from "@/shared/infrastructure/database/index.js";
import { lobbyTables } from "../../../infrastructure/persistence/schema.js";
import { type LobbyListing, listingOf } from "../../lobby-listing.js";
import { toLobbyTable } from "../../../infrastructure/persistence/rows.js";
import { GetLobbyTablesQuery } from "./get-lobby-tables.query.js";

/** How many tables the lobby lists at most. */
export const LOBBY_PAGE = 100;

@QueryHandler(GetLobbyTablesQuery)
export class GetLobbyTablesHandler implements IQueryHandler<GetLobbyTablesQuery> {
	constructor(@InjectDatabase() private readonly db: Database) {}

	async execute({
		filters,
	}: GetLobbyTablesQuery): Promise<readonly LobbyListing[]> {
		const seated = sql<number>`jsonb_array_length(${lobbyTables.players})`;
		const rows = await this.db
			.select()
			.from(lobbyTables)
			.where(
				and(
					eq(lobbyTables.status, "open"),
					eq(lobbyTables.visibility, "public"),
					filters.presetId === undefined
						? undefined
						: eq(lobbyTables.presetId, filters.presetId),
					filters.maxSeats === undefined
						? undefined
						: eq(lobbyTables.maxSeats, filters.maxSeats),
					filters.hasFreeSeat
						? sql`${seated} < ${lobbyTables.maxSeats}`
						: undefined,
				),
			)
			.orderBy(desc(seated), desc(lobbyTables.createdAt))
			.limit(LOBBY_PAGE);
		return rows.map((row) => listingOf(toLobbyTable(row)));
	}
}
