/** Timings of the table runtimes; the module fills them in from `AppConfig`. */
export abstract class TableRuntimeOptions {
	/** The pause between the end of a hand and the deal of the next (`TABLE_HAND_PAUSE_MS`). */
	abstract readonly handPauseMs: number;
	/** How long a table may go without commands before its runtime is dropped from memory. */
	abstract readonly idleMs: number;
}
