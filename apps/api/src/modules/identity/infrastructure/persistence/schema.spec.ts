import { getTableConfig } from "drizzle-orm/pg-core";
import { accounts, sessions, users, verifications } from "./schema.js";

describe("identity schema", () => {
	it("prefixes every table with the context", () => {
		expect(
			[users, sessions, accounts, verifications].map(
				(table) => getTableConfig(table).name,
			),
		).toEqual([
			"identity_users",
			"identity_sessions",
			"identity_accounts",
			"identity_verifications",
		]);
	});

	it.each([sessions, accounts])(
		"deletes the user's rows in %# with the user",
		(table) => {
			const [foreignKey] = getTableConfig(table).foreignKeys;
			const reference = foreignKey!.reference();

			expect(foreignKey!.onDelete).toBe("cascade");
			expect(reference.columns.map((column) => column.name)).toEqual([
				"user_id",
			]);
			expect(reference.foreignColumns).toEqual([users.id]);
		},
	);

	it.each([users, sessions, accounts, verifications])(
		"refreshes updatedAt of %# on every update",
		(table) => {
			const before = Date.now();
			const updatedAt = table.updatedAt.onUpdateFn?.() as Date;

			expect(updatedAt.getTime()).toBeGreaterThanOrEqual(before);
		},
	);
});
