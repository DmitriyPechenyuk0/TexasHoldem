import { z } from "zod";

/**
 * `table.summary-changed` v1: who sits at a table and whether it is open, after a change to either,
 * and how many hands ended in that change. What the lobby lists (Context Map: Table → Lobby).
 */
export const TableSummaryChangedV1 = z.object({
	tableId: z.string().min(1),
	status: z.enum(["open", "closed"]),
	players: z
		.array(z.object({ seat: z.int().nonnegative(), userId: z.string().min(1) }))
		.readonly(),
	handsSettled: z.int().nonnegative(),
});
export type TableSummaryChangedV1 = z.infer<typeof TableSummaryChangedV1>;

/**
 * `table.pots-awarded` v1: who won what in a hand, pot by pot, in the order the pots were awarded.
 * `category` names the winning hand when its winner showed it (`flush`, …), and is null when the
 * hand was never shown (everyone else folded). What the chat's dealer says (Table → Chat).
 */
export const PotsAwardedV1 = z.object({
	tableId: z.string().min(1),
	handId: z.string().min(1),
	awards: z
		.array(
			z.object({
				pot: z.int().nonnegative(),
				userId: z.string().min(1),
				amount: z.int().positive(),
				category: z.string().nullable(),
			}),
		)
		.readonly(),
});
export type PotsAwardedV1 = z.infer<typeof PotsAwardedV1>;
