import { Injectable } from "@nestjs/common";
import { and, count, eq, sql } from "drizzle-orm";
import {
	type Database,
	InjectDatabase,
	inTransaction,
} from "@/shared/infrastructure/database/index.js";
import type { LobbyTable } from "../../domain/lobby-table.js";
import { LobbyTableRepository } from "../../domain/lobby-table.repository.js";
import { lobbyTables } from "./schema.js";

@Injectable()
export class DrizzleLobbyTableRepository extends LobbyTableRepository {
	constructor(@InjectDatabase() private readonly db: Database) {
		super();
	}

	/** One creator's tables are added one at a time: a lock on the creator, held to the commit. */
	addUnderLimit(table: LobbyTable, limit: number): Promise<boolean> {
		return inTransaction(this.db, async (tx) => {
			await tx.execute(
				sql`select pg_advisory_xact_lock(hashtextextended(${`lobby:${table.creatorId}`}, 0))`,
			);
			const [open] = await tx
				.select({ tables: count() })
				.from(lobbyTables)
				.where(
					and(
						eq(lobbyTables.creatorId, table.creatorId),
						eq(lobbyTables.status, "open"),
					),
				);
			if ((open?.tables ?? 0) >= limit) {
				return false;
			}
			await tx.insert(lobbyTables).values(table);
			return true;
		});
	}

	async remove(tableId: string): Promise<void> {
		await this.db.delete(lobbyTables).where(eq(lobbyTables.id, tableId));
	}
}
