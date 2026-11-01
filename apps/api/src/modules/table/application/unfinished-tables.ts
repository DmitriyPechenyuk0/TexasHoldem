/**
 * Port for the tables whose last hand never ended: what an instance takes up when the api starts,
 * should every instance have stopped mid-hand (POK-80).
 */
export abstract class UnfinishedTables {
	abstract list(): Promise<readonly string[]>;
}
