import { err, ok, type Result } from "@/shared/domain/result.js";
import { InvalidTableNameError, UnknownPresetError } from "./lobby-errors.js";
import { presetById, type StakePreset } from "./stake-presets.js";

export type TableVisibility = "public" | "private";
export type LobbyTableStatus = "open" | "closed";

/**
 * A table as the lobby lists it (Context Map, customer–supplier): what it was created with and
 * by whom. The table context runs it.
 */
export interface LobbyTable {
	readonly id: string;
	readonly name: string;
	readonly presetId: string;
	readonly maxSeats: number;
	readonly visibility: TableVisibility;
	readonly creatorId: string;
	readonly status: LobbyTableStatus;
	readonly createdAt: Date;
}

/** At most this many characters, once trimmed (shared contract `TABLE_NAME_LENGTH`). */
export const TABLE_NAME = { min: 1, max: 40 } as const;

/** A player keeps at most this many tables of theirs open at once. */
export const MAX_OPEN_TABLES_PER_CREATOR = 3;

export interface NewTable {
	readonly id: string;
	readonly name: string;
	readonly presetId: string;
	readonly maxSeats: number;
	readonly visibility: TableVisibility;
	readonly creatorId: string;
	readonly createdAt: Date;
}

/** A new open table and its stakes, or the rule its settings break. Seats are checked by the table. */
export function createLobbyTable(
	table: NewTable,
): Result<{ table: LobbyTable; preset: StakePreset }> {
	const name = table.name.trim();
	if (name.length < TABLE_NAME.min || name.length > TABLE_NAME.max) {
		return err(new InvalidTableNameError(TABLE_NAME.min, TABLE_NAME.max));
	}
	const preset = presetById(table.presetId);
	if (!preset) {
		return err(new UnknownPresetError(table.presetId));
	}
	return ok({ table: { ...table, name, status: "open" }, preset });
}
