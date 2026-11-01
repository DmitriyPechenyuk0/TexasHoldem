import { DomainError } from "@/shared/domain/domain-error.js";

export class InvalidTableNameError extends DomainError {
	readonly kind = "rule-violation";
	readonly code = "lobby.invalid-name";

	constructor(min: number, max: number) {
		super(`A table's name has ${min} to ${max} characters`, {
			params: { min, max },
		});
	}
}

export class UnknownPresetError extends DomainError {
	readonly kind = "rule-violation";
	readonly code = "lobby.unknown-preset";

	constructor(presetId: string) {
		super(`No stakes are called ${presetId}`, { params: { presetId } });
	}
}

/** A player keeps at most this many tables of theirs open, so nobody floods the lobby. */
export class TooManyTablesError extends DomainError {
	readonly kind = "conflict";
	readonly code = "lobby.too-many-tables";

	constructor(max: number) {
		super(`At most ${max} open tables per player`, { params: { max } });
	}
}
