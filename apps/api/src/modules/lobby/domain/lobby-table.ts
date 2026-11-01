import { err, ok, type Result } from "@/shared/domain/result.js";
import {
	InvalidPasswordError,
	InvalidTableNameError,
	PasswordNeedsPrivateError,
	UnknownPresetError,
} from "./lobby-errors.js";
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
	/** A private table's invite code (`InviteCode`); null for a public one. */
	readonly inviteCode: string | null;
	/** The hash of a private table's password (never the password); null without one. */
	readonly passwordHash: string | null;
	/** Who sits where, as the table last told (`table.summary-changed`). */
	readonly players: readonly SeatedPlayer[];
	readonly handsPlayed: number;
	/** Since when nobody has sat at the table; null while someone does. */
	readonly emptySince: Date | null;
}

/** How long a table may stay empty before it is closed (POK-98): a private one waits longer. */
export const EMPTY_TABLE_TTL_MS: Readonly<Record<TableVisibility, number>> = {
	public: 15 * 60_000,
	private: 60 * 60_000,
};

/** When an empty table is closed; null while someone sits at it. */
export const closesAt = (table: LobbyTable): Date | null =>
	table.emptySince &&
	new Date(table.emptySince.getTime() + EMPTY_TABLE_TTL_MS[table.visibility]);

export interface SeatedPlayer {
	readonly seat: number;
	readonly userId: string;
}

/** What the table tells the lobby after each change to its players or status. */
export interface TableSummary {
	readonly tableId: string;
	readonly status: LobbyTableStatus;
	readonly players: readonly SeatedPlayer[];
	readonly handsSettled: number;
}

/** At most this many characters, once trimmed (shared contract `TABLE_NAME_LENGTH`). */
export const TABLE_NAME = { min: 1, max: 40 } as const;

/** A private table's password, in characters (shared contract `TABLE_PASSWORD_LENGTH`). */
export const TABLE_PASSWORD = { min: 4, max: 64 } as const;

/** Invite codes: 8 characters without look-alikes, read out loud easily (`InviteCode`). */
export const INVITE_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const INVITE_CODE_LENGTH = 8;

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
	/** Given to a private table only. */
	readonly inviteCode: string | null;
	readonly password?: string;
}

/**
 * A new open table and its stakes, or the rule its settings break. Seats are checked by the table.
 * The password is checked here and hashed by the caller (`passwordHash` is null until then).
 */
export function createLobbyTable({
	password,
	...table
}: NewTable): Result<{ table: LobbyTable; preset: StakePreset }> {
	const name = table.name.trim();
	if (name.length < TABLE_NAME.min || name.length > TABLE_NAME.max) {
		return err(new InvalidTableNameError(TABLE_NAME.min, TABLE_NAME.max));
	}
	const preset = presetById(table.presetId);
	if (!preset) {
		return err(new UnknownPresetError(table.presetId));
	}
	if (password !== undefined) {
		if (table.visibility !== "private") {
			return err(new PasswordNeedsPrivateError());
		}
		if (
			password.length < TABLE_PASSWORD.min ||
			password.length > TABLE_PASSWORD.max
		) {
			return err(
				new InvalidPasswordError(TABLE_PASSWORD.min, TABLE_PASSWORD.max),
			);
		}
	}
	return ok({
		table: {
			...table,
			name,
			status: "open",
			inviteCode: table.visibility === "private" ? table.inviteCode : null,
			passwordHash: null,
			players: [],
			handsPlayed: 0,
			emptySince: table.createdAt,
		},
		preset,
	});
}

/**
 * Who may follow or sit at the table: anyone at a public one; at a private one, its creator and
 * whoever redeemed its invite (`hasGrant`).
 */
export const mayJoin = (
	table: LobbyTable,
	userId: string,
	hasGrant: boolean,
): boolean =>
	table.visibility === "public" || table.creatorId === userId || hasGrant;
