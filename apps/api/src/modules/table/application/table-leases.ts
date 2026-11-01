/** One instance's right to run a table (ADR-004), and the epoch its events are fenced with. */
export interface TableLease {
	readonly tableId: string;
	/** Grows with every new holder: a stream refuses events of an older epoch than its last. */
	readonly epoch: number;
}

/**
 * Port for table leases (ADR-004): at most one instance runs a table at a time. A lease lasts its
 * time to live unless renewed; one whose holder stopped without releasing it runs out, and its
 * table becomes an orphan another instance takes over.
 */
export abstract class TableLeases {
	/** This instance, as leases and requests between instances name it. */
	abstract readonly instanceId: string;

	/**
	 * Takes the table's lease unless another instance holds it; null if one does. Its epoch is above
	 * `atLeast`, the epoch of the table's last stored events, should the counter have been lost.
	 */
	abstract acquire(
		tableId: string,
		atLeast: number,
	): Promise<TableLease | null>;

	/** The instance holding the table's lease, if any. */
	abstract ownerOf(tableId: string): Promise<string | null>;

	/**
	 * Extends the lease for another time to live; false once it has run out or another instance
	 * holds it. Throws when Redis does not answer, which says nothing about the lease.
	 */
	abstract renew(lease: TableLease): Promise<boolean>;

	/** Gives the lease up, if it is still this one. */
	abstract release(lease: TableLease): Promise<void>;

	/** Tables whose lease ran out instead of being released: their holder stopped. */
	abstract orphans(): Promise<readonly string[]>;
}
