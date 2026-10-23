import type { Ack } from "@holdem/shared";
import { type ProblemContext, problemFor } from "./problem.js";

export type AckFailure = Extract<Ack<never>, { ok: false }>;

/**
 * The failed reply to a socket command, with the same problem an HTTP request would get.
 * Gateways log unexpected errors themselves: `problemFor(error).unexpected` tells which.
 */
export function ackFailure(
	error: unknown,
	context?: ProblemContext,
): AckFailure {
	return { ok: false, error: problemFor(error, context).problem };
}
