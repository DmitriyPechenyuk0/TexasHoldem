import { Command } from "@nestjs/cqrs";
import type { TableVisibility } from "../../../domain/lobby-table.js";

/** The new table, and the invite code of a private one. */
export interface CreatedTable {
	readonly tableId: string;
	readonly inviteCode: string | null;
}

/**
 * A verified player creates a table, and is its creator: the lobby keeps its row, and the table
 * context opens it.
 */
export class CreateTableCommand extends Command<CreatedTable> {
	constructor(
		readonly creatorId: string,
		readonly name: string,
		readonly presetId: string,
		readonly maxSeats: number,
		readonly visibility: TableVisibility,
		/** Seconds a turn lasts; 20 unless set. */
		readonly turnSeconds?: number,
		/** A private table's password. */
		readonly password?: string,
	) {
		super();
	}
}
