import { Command, Query } from "@nestjs/cqrs";

/** An open table, as an invite shows it: the lobby's listing, and whether it is private. */
export interface InvitableTable {
	readonly tableId: string;
	readonly name: string;
	readonly presetId: string;
	readonly smallBlind: number;
	readonly bigBlind: number;
	readonly maxSeats: number;
	readonly playerCount: number;
	readonly handsPlayed: number;
	readonly visibility: "public" | "private";
}

// Inviting a friend to a table, asked by the social context and answered by the lobby. In the
// shared kernel, so social asks without knowing who answers.

/**
 * The open table, if the user may bring a friend to it: one they may join themselves. Null for a
 * closed or unknown table, or one the user has no access to.
 */
export class GetInvitableTableQuery extends Query<InvitableTable | null> {
	constructor(
		readonly tableId: string,
		readonly userId: string,
	) {
		super();
	}
}

/**
 * Lets the user join the table, as a friend's invite does: a private table grants them access,
 * as its invite code would, with no password. Sent only for an invite the user accepted.
 */
export class GrantTableAccessCommand extends Command<void> {
	constructor(
		readonly tableId: string,
		readonly userId: string,
	) {
		super();
	}
}
