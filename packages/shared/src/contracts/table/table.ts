import { z } from "zod";
import { HandId, TableId } from "../common/ids.js";

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
	reconnectGraceSeconds: setting.optional(),
	disconnectedTurnSeconds: setting.optional(),
	sitOutSeconds: setting.optional(),
	sitOutHands: setting.optional(),
	visibility: z.enum(["public", "private"]).optional(),
});
export type CreateDevTableRequest = z.infer<typeof CreateDevTableRequest>;

export const CreateDevTableResponse = z.object({ tableId: TableId });
export type CreateDevTableResponse = z.infer<typeof CreateDevTableResponse>;

/**
 * `GET /api/hands/:handId/fairness`, once the hand has ended: everything `verifyDeck` from
 * `@holdem/engine` needs to check it (ADR-008). The commitment was published before the deal; the
 * dealt cards are the deck's first cards, in the order the hand took them (burns included).
 */
export const HandFairnessResponse = z.object({
	handId: HandId,
	/** Lower-case hex SHA-256 of the server seed. */
	commitment: z.string().regex(/^[0-9a-f]{64}$/),
	/** Hex. */
	serverSeed: z.string().regex(/^(?:[0-9a-f]{2})+$/),
	/** Mixed into the hand seed after the server seed; none for now. */
	clientSeeds: z.array(z.string()),
	dealtCards: z.array(z.int().min(0).max(51)),
});
export type HandFairnessResponse = z.infer<typeof HandFairnessResponse>;
