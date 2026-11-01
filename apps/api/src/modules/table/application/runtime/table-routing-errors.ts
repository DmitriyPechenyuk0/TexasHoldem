import { DomainError } from "@/shared/domain/domain-error.js";

/**
 * The table moved to another instance while a request was on its way, or this instance lost it.
 * Sent again once, to the new holder; a client that still gets it sends the command again.
 */
export class TableMovedError extends DomainError {
	readonly kind = "conflict";
	readonly code = "table.moved";

	constructor(tableId: string) {
		super(`Table ${tableId} is run by another instance now`, {
			params: { tableId },
		});
	}
}

/**
 * The instance holding the table does not answer: it may have stopped, and another one takes the
 * table over once its lease runs out. The client sends the command again a little later.
 */
export class TableUnavailableError extends DomainError {
	readonly kind = "conflict";
	readonly code = "table.unavailable";

	constructor(tableId: string) {
		super(`Table ${tableId} does not answer for now`, { params: { tableId } });
	}
}
