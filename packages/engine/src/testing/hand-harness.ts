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
				// oxlint-disable-next-line unicorn/no-thenable -- reads as given/when/then; never awaited
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

/**
 * Runs commands one after another from `history`, each against the state the previous ones left,
 * and returns the whole history. Fails the test with the error code if any command is rejected.
 */
export function play(
	history: readonly HandEvent[],
	...commands: HandCommand[]
): HandEvent[] {
	const events = [...history];
	for (const command of commands) {
		const decision = decide(command, replayHand(events));
		if (!decision.ok) {
			throw new Error(`${command.type} was rejected: ${decision.error.code}`);
		}
		events.push(...decision.events);
	}
	return events;
}
