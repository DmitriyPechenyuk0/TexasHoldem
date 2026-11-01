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
 * `lobby.unknown-preset`, and a fourth open table `lobby.too-many-tables`.
 */
export const CreateTableRequest = z.object({
	name: z.string().max(256),
	presetId: z.string().min(1).max(32),
	maxSeats: z.int().min(TABLE_SEATS.min).max(TABLE_SEATS.max),
	visibility: z.enum(["public", "private"]),
	/** Seconds a turn lasts; 20 unless set. */
	turnSeconds: z.int().min(TURN_SECONDS.min).max(TURN_SECONDS.max).optional(),
});
export type CreateTableRequest = z.infer<typeof CreateTableRequest>;

/** The table is open: join it on the `/table` namespace with this id. */
export const CreateTableResponse = z.object({ tableId: TableId });
export type CreateTableResponse = z.infer<typeof CreateTableResponse>;
