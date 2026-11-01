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
