import type { Chips, SeatIndex } from "@holdem/engine";
import { DomainError } from "@/shared/domain/domain-error.js";
import type { InvalidTableConfigReason } from "./table-config.js";

export class TableNotOpenError extends DomainError {
	readonly kind = "not-found";
	readonly code = "table.not-open";

	constructor() {
		super("No such table");
	}
}

export class TableAlreadyOpenError extends DomainError {
	readonly kind = "conflict";
	readonly code = "table.already-open";

	constructor() {
		super("The table is already open");
	}
}

export class TableClosedError extends DomainError {
	readonly kind = "conflict";
	readonly code = "table.closed";

	constructor() {
		super("The table is closed");
	}
}

export class InvalidTableConfigError extends DomainError {
	readonly kind = "rule-violation";
	readonly code = "table.invalid-config";

	constructor(reason: InvalidTableConfigReason) {
		super(`The table config is invalid: ${reason}`, { params: { reason } });
	}
}

export class NotVerifiedError extends DomainError {
	readonly kind = "forbidden";
	readonly code = "table.not-verified";

	constructor() {
		super("Verify your email to take a seat");
	}
}

export class AlreadySeatedError extends DomainError {
	readonly kind = "conflict";
	readonly code = "table.already-seated";

	constructor(seat: SeatIndex) {
		super(`Already seated at seat ${seat}`, { params: { seat } });
	}
}

export class SeatOutOfRangeError extends DomainError {
	readonly kind = "rule-violation";
	readonly code = "table.seat-out-of-range";

	constructor(seat: SeatIndex, maxSeats: number) {
		super(`Seat ${seat} is not at a table of ${maxSeats}`, {
			params: { seat, maxSeats },
		});
	}
}

export class SeatTakenError extends DomainError {
	readonly kind = "conflict";
	readonly code = "table.seat-taken";

	constructor(seat: SeatIndex) {
		super(`Seat ${seat} is taken`, { params: { seat } });
	}
}

/** Also for a rebuy, and for a top-up, whose range is what the stack still has room for. */
export class BuyInOutOfRangeError extends DomainError {
	readonly kind = "rule-violation";
	readonly code = "table.buy-in-out-of-range";

	constructor(min: Chips, max: Chips) {
		super(`Bring between ${min} and ${max} chips`, { params: { min, max } });
	}
}

export class NotSeatedError extends DomainError {
	readonly kind = "rule-violation";
	readonly code = "table.not-seated";

	constructor() {
		super("Not seated at this table");
	}
}

/** The player is leaving: they keep the seat only until the hand ends. */
export class LeavingSeatError extends DomainError {
	readonly kind = "conflict";
	readonly code = "table.leaving-seat";

	constructor() {
		super("Already leaving the seat");
	}
}

export class AlreadySittingOutError extends DomainError {
	readonly kind = "conflict";
	readonly code = "table.already-sitting-out";

	constructor() {
		super("Already sitting out");
	}
}

export class NotSittingOutError extends DomainError {
	readonly kind = "conflict";
	readonly code = "table.not-sitting-out";

	constructor() {
		super("Not sitting out");
	}
}

/** The stack is empty: rebuy first. */
export class NoChipsError extends DomainError {
	readonly kind = "rule-violation";
	readonly code = "table.no-chips";

	constructor() {
		super("No chips left: rebuy first");
	}
}

/** The player still has chips: top up instead. */
export class NotBustedError extends DomainError {
	readonly kind = "rule-violation";
	readonly code = "table.not-busted";

	constructor() {
		super("Chips left: top up instead");
	}
}

export class StackFullError extends DomainError {
	readonly kind = "rule-violation";
	readonly code = "table.stack-full";

	constructor(max: Chips) {
		super(`The stack is at the maximum buy-in of ${max}`, {
			params: { max },
		});
	}
}

/** Chips can be added only between the player's hands. */
export class InHandError extends DomainError {
	readonly kind = "conflict";
	readonly code = "table.in-hand";

	constructor() {
		super("Wait until the hand ends");
	}
}

export class HandInProgressError extends DomainError {
	readonly kind = "conflict";
	readonly code = "table.hand-in-progress";

	constructor() {
		super("A hand is being played");
	}
}

export class AlreadySpectatingError extends DomainError {
	readonly kind = "conflict";
	readonly code = "table.already-spectating";

	constructor() {
		super("Already watching this table");
	}
}

export class NotSpectatingError extends DomainError {
	readonly kind = "conflict";
	readonly code = "table.not-spectating";

	constructor() {
		super("Not watching this table");
	}
}

export class SpectatorsFullError extends DomainError {
	readonly kind = "conflict";
	readonly code = "table.spectators-full";

	constructor(max: number) {
		super(`At most ${max} users watch a table`, { params: { max } });
	}
}

export type TableError =
	| TableNotOpenError
	| TableAlreadyOpenError
	| TableClosedError
	| InvalidTableConfigError
	| NotVerifiedError
	| AlreadySeatedError
	| SeatOutOfRangeError
	| SeatTakenError
	| BuyInOutOfRangeError
	| NotSeatedError
	| LeavingSeatError
	| AlreadySittingOutError
	| NotSittingOutError
	| NoChipsError
	| NotBustedError
	| StackFullError
	| InHandError
	| HandInProgressError
	| AlreadySpectatingError
	| NotSpectatingError
	| SpectatorsFullError;
