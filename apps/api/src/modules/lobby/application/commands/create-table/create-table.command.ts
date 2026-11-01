import { Command } from "@nestjs/cqrs";
import type { TableVisibility } from "../../../domain/lobby-table.js";

/**
 * A verified player creates a table, and is its creator: the lobby keeps its row, and the table
 * context opens it. Answers its id.
 */
export class CreateTableCommand extends Command<string> {
	constructor(
		readonly creatorId: string,
		readonly name: string,
		readonly presetId: string,
		readonly maxSeats: number,
		readonly visibility: TableVisibility,
		/** Seconds a turn lasts; 20 unless set. */
		readonly turnSeconds?: number,
	) {
		super();
	}
}
