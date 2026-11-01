import { Query } from "@nestjs/cqrs";

/**
 * Whether the user may follow or sit at the table, asked by the table context before either. The
 * lobby answers it: anyone may join a public table; a private one takes its creator and whoever
 * redeemed its invite. In the shared kernel, so the table asks without knowing who answers.
 */
export class CanJoinTableQuery extends Query<boolean> {
	constructor(
		readonly tableId: string,
		readonly userId: string,
	) {
		super();
	}
}
