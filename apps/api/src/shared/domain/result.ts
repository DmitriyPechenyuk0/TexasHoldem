import type { DomainError } from "./domain-error.js";

export interface Ok<T> {
	readonly ok: true;
	readonly value: T;
}

export interface Err<E> {
	readonly ok: false;
	readonly error: E;
}

/** Outcome of a domain operation that can fail by the rules. Domain code returns it instead of throwing. */
export type Result<T, E extends DomainError = DomainError> = Ok<T> | Err<E>;

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });

export const err = <E extends DomainError>(error: E): Err<E> => ({
	ok: false,
	error,
});
