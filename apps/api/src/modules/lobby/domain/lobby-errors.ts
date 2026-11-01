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

export class PasswordNeedsPrivateError extends DomainError {
	readonly kind = "rule-violation";
	readonly code = "lobby.password-needs-private";

	constructor() {
		super("Only a private table takes a password");
	}
}

export class InvalidPasswordError extends DomainError {
	readonly kind = "rule-violation";
	readonly code = "lobby.invalid-password";

	constructor(min: number, max: number) {
		super(`A table's password has ${min} to ${max} characters`, {
			params: { min, max },
		});
	}
}

/** No open private table has this code: it never did, was regenerated, or the table closed. */
export class InviteNotFoundError extends DomainError {
	readonly kind = "not-found";
	readonly code = "lobby.invite-not-found";

	constructor() {
		super("No such invite");
	}
}

export class WrongPasswordError extends DomainError {
	readonly kind = "forbidden";
	readonly code = "lobby.wrong-password";

	constructor() {
		super("Wrong password");
	}
}

export class LobbyTableNotFoundError extends DomainError {
	readonly kind = "not-found";
	readonly code = "lobby.table-not-found";

	constructor() {
		super("No such table");
	}
}

/** Only the table's creator manages it. */
export class NotCreatorError extends DomainError {
	readonly kind = "forbidden";
	readonly code = "lobby.not-creator";

	constructor() {
		super("Only the table's creator may do that");
	}
}

/** A table is closed by hand only once nobody sits at it. */
export class TableNotEmptyError extends DomainError {
	readonly kind = "conflict";
	readonly code = "lobby.table-not-empty";

	constructor() {
		super("Players still sit at the table");
	}
}

/** A public table has no invite. */
export class NotPrivateError extends DomainError {
	readonly kind = "rule-violation";
	readonly code = "lobby.not-private";

	constructor() {
		super("Only a private table has an invite");
	}
}
