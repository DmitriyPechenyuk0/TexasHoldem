import type { DomainError } from "./domain-error.js";
import type { Result } from "./result.js";

/**
 * An event-sourced aggregate as three pure parts (ADR-002): `decide` answers the events a command
 * produces or the rule it breaks, `evolve` folds one event into the state, and every stream starts
 * from `initialState`.
 */
export interface Decider<C, S, E, Err extends DomainError = DomainError> {
	readonly decide: (command: C, state: S) => Result<readonly E[], Err>;
	readonly evolve: (state: S, event: E) => S;
	readonly initialState: S;
}
