import { z } from "zod";

/** `GET /api/system/time`: the server clock, so clients can correct theirs before rendering turn timers. */
export const ServerTimeResponse = z.object({
	/** ISO 8601, UTC. */
	now: z.iso.datetime(),
});
export type ServerTimeResponse = z.infer<typeof ServerTimeResponse>;
