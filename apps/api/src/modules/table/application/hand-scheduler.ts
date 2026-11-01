/** Port that deals a table's next hand once the pause between hands is over. */
export abstract class HandScheduler {
	/** Sends `StartNextHandCommand` for the table after the pause, unless one is already due. */
	abstract schedule(tableId: string): void;
}
