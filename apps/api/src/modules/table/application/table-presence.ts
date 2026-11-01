/**
 * Port for who follows each table, across every api instance (POK-85): a user is connected to a
 * table while any of their connections follows it, on whichever instance. A connection whose
 * instance stopped without closing it is forgotten after a while.
 */
export abstract class TablePresence {
	/** Records a connection; answers whether it is now the user's only one at the table. */
	abstract connect(
		tableId: string,
		userId: string,
		connectionId: string,
	): Promise<boolean>;

	/** Forgets a connection; answers whether the user has none left at the table. */
	abstract disconnect(
		tableId: string,
		userId: string,
		connectionId: string,
	): Promise<boolean>;
}
