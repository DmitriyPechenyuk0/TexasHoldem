import { DomainError } from "@/shared/domain/domain-error.js";

/** A private table, and no invite of it redeemed: the lobby keeps who may join (`CanJoinTableQuery`). */
export class TableAccessDeniedError extends DomainError {
	readonly kind = "forbidden";
	readonly code = "table.access-denied";

	constructor() {
		super("This table takes only the players it invited");
	}
}
