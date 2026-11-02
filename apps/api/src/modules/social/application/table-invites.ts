/** An invite waiting for an answer. */
export interface PendingInvite {
	readonly inviterId: string;
	readonly tableId: string;
	readonly expiresAt: Date;
}

/** Port for the table invites waiting for players' answers, until they run out (POK-109). */
export abstract class TableInvites {
	/** Keeps the invite until `expiresAt`; it replaces one from the same friend to the same table. */
	abstract add(
		inviteeId: string,
		inviterId: string,
		tableId: string,
		expiresAt: Date,
	): Promise<void>;

	/** Takes the invite out; false when none waits at `now` (never sent, answered, or ran out). */
	abstract take(
		inviteeId: string,
		inviterId: string,
		tableId: string,
		now: Date,
	): Promise<boolean>;

	/** The invites waiting for the player at `now`, newest first. */
	abstract pending(
		inviteeId: string,
		now: Date,
	): Promise<readonly PendingInvite[]>;
}
