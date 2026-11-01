import { AsyncLocalStorage } from "node:async_hooks";
import type { Database } from "./database.js";

/** A transaction's client: what `db.transaction` hands its work. */
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

interface Scope {
	readonly afterCommit: (() => void)[];
	done: boolean;
}

const scopes = new AsyncLocalStorage<Scope>();

/**
 * Runs `work` in one transaction. What it schedules with `afterCommit`, such as publishing
 * integration events, runs once the transaction has committed, in order, and never if it rolls
 * back. Transactions do not nest: `work` uses the `tx` it is given.
 */
export async function inTransaction<T>(
	db: Database,
	work: (tx: Transaction) => Promise<T>,
): Promise<T> {
	if (scopes.getStore()?.done === false) {
		throw new Error("Transactions do not nest: use the tx you were given");
	}
	const scope: Scope = { afterCommit: [], done: false };
	let result: T;
	try {
		result = await scopes.run(scope, () => db.transaction(work));
	} finally {
		scope.done = true;
	}
	for (const callback of scope.afterCommit) {
		callback();
	}
	return result;
}

/**
 * Runs `callback` once the current transaction has committed, or at once outside one. Work that
 * outlives its transaction, such as a timer it started, runs its callbacks at once.
 */
export function afterCommit(callback: () => void): void {
	const scope = scopes.getStore();
	if (scope && !scope.done) {
		scope.afterCommit.push(callback);
	} else {
		callback();
	}
}
