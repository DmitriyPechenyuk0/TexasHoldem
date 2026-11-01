import { z } from "zod";
import { Chips } from "../common/chips.js";
import { TableId } from "../common/ids.js";

/**
 * Length of a table's name, in characters, once trimmed. The api enforces it with a stable code
 * (`lobby.invalid-name`); forms can use it for hints.
 */
export const TABLE_NAME_LENGTH = { min: 1, max: 40 } as const;

/** Seats a table may have. */
export const TABLE_SEATS = { min: 2, max: 9 } as const;

/** Seconds a turn may last, when a table sets its own. */
export const TURN_SECONDS = { min: 5, max: 120, default: 20 } as const;

/** Length of a private table's password; the api answers `lobby.invalid-password` otherwise. */
export const TABLE_PASSWORD_LENGTH = { min: 4, max: 64 } as const;

/**
 * A private table's invite code: 8 characters from an alphabet without look-alikes (no 0/O, 1/I/L),
 * so it can be read out loud. Links are `/{locale}/t/{code}`; lowercase is accepted.
 */
export const InviteCode = z
	.string()
	.regex(/^[23456789A-HJ-KMNP-Za-hj-kmnp-z]{8}$/)
	.transform((code) => code.toUpperCase());
export type InviteCode = z.infer<typeof InviteCode>;

/** One of the stakes a table can be created with: its blinds, and the buy-in range in big blinds. */
export const StakePreset = z.object({
	id: z.string(),
	smallBlind: Chips,
	bigBlind: Chips,
	minBuyInBigBlinds: z.int().positive(),
	maxBuyInBigBlinds: z.int().positive(),
});
export type StakePreset = z.infer<typeof StakePreset>;

/** `GET /api/lobby/presets`: the stakes, from the smallest. */
export const StakePresetsResponse = z.array(StakePreset).readonly();
export type StakePresetsResponse = z.infer<typeof StakePresetsResponse>;

/**
 * `POST /api/lobby/tables`, by a verified player, who becomes the table's creator. The name is only
 * bounded here: the api trims it and answers `lobby.invalid-name`; an unknown preset is
 * `lobby.unknown-preset`, and a fourth open table `lobby.too-many-tables`. Only a private table
 * takes a password (`lobby.password-needs-private`).
 */
export const CreateTableRequest = z.object({
	name: z.string().max(256),
	presetId: z.string().min(1).max(32),
	maxSeats: z.int().min(TABLE_SEATS.min).max(TABLE_SEATS.max),
	visibility: z.enum(["public", "private"]),
	/** Seconds a turn lasts; 20 unless set. */
	turnSeconds: z.int().min(TURN_SECONDS.min).max(TURN_SECONDS.max).optional(),
	/** Asked of everyone the invite brings, but the creator. */
	password: z.string().max(256).optional(),
});
export type CreateTableRequest = z.infer<typeof CreateTableRequest>;

/** The table is open: join it on the `/table` namespace with this id. A private one has an invite. */
export const CreateTableResponse = z.object({
	tableId: TableId,
	inviteCode: z.string().nullable(),
});
export type CreateTableResponse = z.infer<typeof CreateTableResponse>;

/**
 * `GET /api/lobby/invites/:code`: the private table an invite leads to. An unknown code is
 * `lobby.invite-not-found`, and says nothing about passwords.
 */
export const InviteResponse = z.object({
	tableId: TableId,
	name: z.string(),
	smallBlind: Chips,
	bigBlind: Chips,
	maxSeats: z.int().min(TABLE_SEATS.min).max(TABLE_SEATS.max),
	passwordRequired: z.boolean(),
});
export type InviteResponse = z.infer<typeof InviteResponse>;

/**
 * `POST /api/lobby/invites/:code/redeem`: grants the user access to the table, with its password if
 * it has one (`lobby.wrong-password`; tries are rate limited). Answers the table to join.
 */
export const RedeemInviteRequest = z.object({
	password: z.string().max(256).optional(),
});
export type RedeemInviteRequest = z.infer<typeof RedeemInviteRequest>;

export const RedeemInviteResponse = z.object({ tableId: TableId });
export type RedeemInviteResponse = z.infer<typeof RedeemInviteResponse>;

/**
 * `POST /api/lobby/tables/:tableId/invite`, by the creator: a new code. The old link stops working;
 * whoever already has access keeps it.
 */
export const InviteCodeResponse = z.object({ inviteCode: z.string() });
export type InviteCodeResponse = z.infer<typeof InviteCodeResponse>;
