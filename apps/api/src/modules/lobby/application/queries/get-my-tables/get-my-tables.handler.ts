import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { and, desc, eq, or, sql } from "drizzle-orm";
import {
	type Database,
	InjectDatabase,
} from "@/shared/infrastructure/database/index.js";
import { toLobbyTable } from "../../../infrastructure/persistence/rows.js";
import { lobbyTables } from "../../../infrastructure/persistence/schema.js";
import { listingOf } from "../../lobby-listing.js";
import { GetMyTablesQuery, type MyTable } from "./get-my-tables.query.js";

@QueryHandler(GetMyTablesQuery)
export class GetMyTablesHandler implements IQueryHandler<GetMyTablesQuery> {
	constructor(@InjectDatabase() private readonly db: Database) {}

	async execute({ userId }: GetMyTablesQuery): Promise<readonly MyTable[]> {
		const rows = await this.db
			.select()
			.from(lobbyTables)
			.where(
				and(
					eq(lobbyTables.status, "open"),
					or(
						eq(lobbyTables.creatorId, userId),
						sql`${lobbyTables.players} @> ${JSON.stringify([{ userId }])}::jsonb`,
					),
				),
			)
			.orderBy(desc(lobbyTables.createdAt));
		return rows.map((row) => {
			const table = toLobbyTable(row);
			const mine = table.creatorId === userId;
			return {
				...listingOf(table),
				visibility: table.visibility,
				mine,
				inviteCode: mine ? table.inviteCode : null,
			};
		});
	}
}
