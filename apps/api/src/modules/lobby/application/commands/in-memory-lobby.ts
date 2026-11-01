import type { LobbyTable, TableSummary } from "../../domain/lobby-table.js";
import {
	type AddOutcome,
	LobbyTableRepository,
} from "../../domain/lobby-table.repository.js";
import { PasswordHasher } from "../password-hasher.js";
import { TableGrants } from "../table-grants.js";

/** The repository for handler tests, with the Postgres one's rules. */
export class InMemoryLobbyTables extends LobbyTableRepository {
	readonly rows: LobbyTable[] = [];

	constructor(...tables: LobbyTable[]) {
		super();
		this.rows.push(...tables);
	}

	async addUnderLimit(table: LobbyTable, limit: number): Promise<AddOutcome> {
		const open = this.rows.filter(
			(row) => row.creatorId === table.creatorId && row.status === "open",
		);
		if (open.length >= limit) return "over-limit";
		if (
			table.inviteCode &&
			this.rows.some((row) => row.inviteCode === table.inviteCode)
		) {
			return "code-taken";
		}
		this.rows.push(table);
		return "added";
	}

	async remove(tableId: string): Promise<void> {
		const index = this.rows.findIndex((row) => row.id === tableId);
		if (index >= 0) this.rows.splice(index, 1);
	}

	async findById(tableId: string): Promise<LobbyTable | null> {
		return this.rows.find((row) => row.id === tableId) ?? null;
	}

	async findOpenByInviteCode(code: string): Promise<LobbyTable | null> {
		return (
			this.rows.find(
				(row) => row.inviteCode === code && row.status === "open",
			) ?? null
		);
	}

	async applySummary(summary: TableSummary): Promise<LobbyTable | null> {
		const index = this.rows.findIndex((row) => row.id === summary.tableId);
		if (index < 0) return null;
		const row = this.rows[index]!;
		this.rows[index] = {
			...row,
			players: summary.players,
			handsPlayed: row.handsPlayed + summary.handsSettled,
			status: row.status === "closed" ? "closed" : summary.status,
		};
		return this.rows[index]!;
	}

	async setInviteCode(tableId: string, code: string): Promise<boolean> {
		if (this.rows.some((row) => row.inviteCode === code)) return false;
		const index = this.rows.findIndex((row) => row.id === tableId);
		this.rows[index] = { ...this.rows[index]!, inviteCode: code };
		return true;
	}
}

/** Hashes that show the password, for tests only. */
export class PlainPasswordHasher extends PasswordHasher {
	async hash(password: string): Promise<string> {
		return `plain:${password}`;
	}

	async verify(password: string, hash: string): Promise<boolean> {
		return hash === `plain:${password}`;
	}
}

export class InMemoryTableGrants extends TableGrants {
	readonly granted = new Set<string>();

	async grant(tableId: string, userId: string): Promise<void> {
		this.granted.add(`${tableId}:${userId}`);
	}

	async holds(tableId: string, userId: string): Promise<boolean> {
		return this.granted.has(`${tableId}:${userId}`);
	}
}

/** A private table of `u-1`'s with the invite code `K7MPQ2XZ`; override any part. */
export const privateTable = (
	overrides: Partial<LobbyTable> = {},
): LobbyTable => ({
	id: "t-1",
	name: "Friday game",
	presetId: "low",
	maxSeats: 6,
	visibility: "private",
	creatorId: "u-1",
	status: "open",
	createdAt: new Date(0),
	inviteCode: "K7MPQ2XZ",
	passwordHash: null,
	players: [],
	handsPlayed: 0,
	...overrides,
});
