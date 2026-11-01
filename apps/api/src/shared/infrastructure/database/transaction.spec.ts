import type { Database } from "./database.js";
import { afterCommit, inTransaction } from "./transaction.js";

/** A database whose transactions run their work and commit, or roll back when it throws. */
const database = {
	transaction: (work: (tx: unknown) => unknown) => work("tx"),
} as unknown as Database;

describe("inTransaction", () => {
	it("runs what the work scheduled once it has committed, in order", async () => {
		const ran: string[] = [];

		const result = await inTransaction(database, async (tx) => {
			afterCommit(() => ran.push("first"));
			await Promise.resolve();
			afterCommit(() => ran.push("second"));
			expect(ran).toEqual([]);
			return tx;
		});

		expect(result).toBe("tx");
		expect(ran).toEqual(["first", "second"]);
	});

	it("drops what the work scheduled when it rolls back", async () => {
		const ran: string[] = [];

		await expect(
			inTransaction(database, async () => {
				afterCommit(() => ran.push("never"));
				throw new Error("rolled back");
			}),
		).rejects.toThrow("rolled back");

		expect(ran).toEqual([]);
	});

	it("runs at once outside a transaction, and after one that is over", async () => {
		const ran: string[] = [];
		afterCommit(() => ran.push("outside"));
		expect(ran).toEqual(["outside"]);

		let later: () => void = () => undefined;
		await inTransaction(database, async () => {
			later = () => afterCommit(() => ran.push("later"));
		});
		later();
		expect(ran).toEqual(["outside", "later"]);
	});

	it("refuses to nest", async () => {
		await expect(
			inTransaction(database, () => inTransaction(database, async () => 1)),
		).rejects.toThrow("Transactions do not nest");
	});
});
