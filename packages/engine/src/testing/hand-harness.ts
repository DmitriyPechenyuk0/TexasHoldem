import type { HandCommand } from "../hand/commands.js";
import { type Decision, decide } from "../hand/decide.js";
import type { HandError } from "../hand/errors.js";
import type { HandEvent } from "../hand/events.js";
import { replayHand } from "../hand/evolve.js";
import type { HandState } from "../hand/state.js";

/**
 * Given/When/Then for the hand decider (ADR-002): `given(history).when(command).then(expected)`,
 * where `expected` is the events the command must produce, or the error it must be rejected with.
 * Every accepted decision is also checked to be plain JSON and to apply cleanly with `evolve`.
 */
export function given(history: readonly HandEvent[]) {
	const state = replayHand(history);
	return {
		state,
		when(command: HandCommand) {
			const decision: Decision = decide(command, state);
			return {
				decision,
				/** Asserts the outcome and returns the state after it (unchanged for an error). */
				then(expected: readonly HandEvent[] | HandError): HandState {
					if (Array.isArray(expected)) {
						expect(decision).toEqual({ ok: true, events: expected });
						const { events } = decision as Extract<Decision, { ok: true }>;
						expect(JSON.parse(JSON.stringify(events))).toEqual(events);
						return replayHand(events, state);
					}
					expect(decision).toEqual({ ok: false, error: expected });
					return state;
				},
			};
		},
	};
}
