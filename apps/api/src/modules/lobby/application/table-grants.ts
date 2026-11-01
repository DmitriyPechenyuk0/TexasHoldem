/**
 * Port for access to private tables: who redeemed an invite. A grant lasts a day after it was last
 * used, so a player who keeps coming back keeps it; a new invite code leaves grants as they are.
 */
export abstract class TableGrants {
	abstract grant(tableId: string, userId: string): Promise<void>;

	/** Whether the user holds a grant for the table, which this use extends. */
	abstract holds(tableId: string, userId: string): Promise<boolean>;
}
