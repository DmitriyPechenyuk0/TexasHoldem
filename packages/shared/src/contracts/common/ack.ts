import { z } from "zod";
import { Problem } from "./problem.js";

/**
 * Reply to a socket command: the result, or the same `Problem` an HTTP endpoint would answer with.
 * Check `ok` to narrow it.
 */
export type Ack<Data> =
	| { readonly ok: true; readonly data: Data }
	| { readonly ok: false; readonly error: Problem };

export const ackOf = <Data extends z.ZodType>(data: Data) =>
	z.discriminatedUnion("ok", [
		z.object({ ok: z.literal(true), data }),
		z.object({ ok: z.literal(false), error: Problem }),
	]);
