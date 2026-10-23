import { z } from "zod";
import { Problem } from "./problem.js";

export interface AckSuccess<Data> {
	readonly ok: true;
	readonly data: Data;
}

/** The same `Problem` an HTTP endpoint would answer with. */
export interface AckFailure {
	readonly ok: false;
	readonly error: Problem;
}

/** Reply to a socket command: the result or the problem. Check `ok` to narrow it. */
export type Ack<Data> = AckSuccess<Data> | AckFailure;

export const ackOf = <Data extends z.ZodType>(data: Data) =>
	z.discriminatedUnion("ok", [
		z.object({ ok: z.literal(true), data }),
		z.object({ ok: z.literal(false), error: Problem }),
	]);
