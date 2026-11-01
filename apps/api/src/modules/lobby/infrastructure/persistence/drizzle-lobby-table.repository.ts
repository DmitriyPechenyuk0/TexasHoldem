import { Injectable } from "@nestjs/common";
import { and, count, eq, sql } from "drizzle-orm";
import {
	type Database,
	InjectDatabase,
	inTransaction,
	isUniqueViolation,
} from "@/shared/infrastructure/database/index.js";
import type {
	LobbyTable,
	LobbyTableStatus,
	TableVisibility,
} from "../../domain/lobby-table.js";
import {
	type AddOutcome,
	LobbyTableRepository,
} from "../../domain/lobby-table.repository.js";
import { lobbyTables } from "./schema.js";

type Row = typeof lobbyTables.$inferSelect;

const toTable = (row: Row): LobbyTable => ({
	...row,
	visibility: row.visibility as TableVisibility,
	status: row.status as LobbyTableStatus,
});

@Injectable()
export class DrizzleLobbyTableRepository extends LobbyTableRepository {
	constructor(@InjectDatabase() private readonly db: Database) {
		super();
	}

	/** One creator's tables are added one at a time: a lock on the creator, held to the commit. */
	async addUnderLimit(table: LobbyTable, limit: number): Promise<AddOutcome> {
		try {
			return await inTransaction(this.db, async (tx) => {
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
					return "over-limit";
				}
				await tx.insert(lobbyTables).values(table);
				return "added";
			});
		} catch (error) {
			if (isUniqueViolation(error)) {
				return "code-taken";
			}
			throw error;
		}
	}

	async remove(tableId: string): Promise<void> {
		await this.db.delete(lobbyTables).where(eq(lobbyTables.id, tableId));
	}

	async findById(tableId: string): Promise<LobbyTable | null> {
		const [row] = await this.db
			.select()
			.from(lobbyTables)
			.where(eq(lobbyTables.id, tableId));
		return row ? toTable(row) : null;
	}

	async findOpenByInviteCode(code: string): Promise<LobbyTable | null> {
		const [row] = await this.db
			.select()
			.from(lobbyTables)
			.where(
				and(eq(lobbyTables.inviteCode, code), eq(lobbyTables.status, "open")),
			);
		return row ? toTable(row) : null;
	}

	async setInviteCode(tableId: string, code: string): Promise<boolean> {
		try {
			await this.db
				.update(lobbyTables)
				.set({ inviteCode: code })
				.where(eq(lobbyTables.id, tableId));
			return true;
		} catch (error) {
			if (isUniqueViolation(error)) {
				return false;
			}
			throw error;
		}
	}
}
