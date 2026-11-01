import { z } from "zod";
import { TableId } from "../common/ids.js";

/** A whole number, bounded only for size: the api applies the table rules with stable codes. */
const setting = z.int().min(0).max(1_000_000);

/**
 * `POST /api/dev/tables`, outside production only: opens a table without the lobby, for trying the
 * table out before M4. Every setting is optional; the api fills in a 1/2 table for six.
 */
export const CreateDevTableRequest = z.object({
	smallBlind: setting.optional(),
	bigBlind: setting.optional(),
	minBuyInBigBlinds: setting.optional(),
	maxBuyInBigBlinds: setting.optional(),
	maxSeats: setting.optional(),
	turnSeconds: setting.optional(),
	timeBankSeconds: setting.optional(),
	visibility: z.enum(["public", "private"]).optional(),
});
export type CreateDevTableRequest = z.infer<typeof CreateDevTableRequest>;

export const CreateDevTableResponse = z.object({ tableId: TableId });
export type CreateDevTableResponse = z.infer<typeof CreateDevTableResponse>;
