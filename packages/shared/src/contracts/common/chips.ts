import { z } from "zod";

/** An amount of chips: a whole, non-negative, safe integer. */
export const Chips = z.int().nonnegative();
export type Chips = z.infer<typeof Chips>;
