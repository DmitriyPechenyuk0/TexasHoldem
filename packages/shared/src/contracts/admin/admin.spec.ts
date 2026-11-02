import { AdminUsersQuery, AuditResponse } from "./index.js";

describe("admin contracts", () => {
	it("look users up by a trimmed, bounded search", () => {
		expect(AdminUsersQuery.parse({ q: "  alice " })).toEqual({ q: "alice" });
		expect(AdminUsersQuery.safeParse({ q: "   " }).success).toBe(false);
	});

	it("list what admins did, with no admin for changes made outside the app", () => {
		const entry = {
			id: "9a3b1c2d-4e5f-4a6b-8c7d-0e1f2a3b4c5d",
			adminId: null,
			action: "set-role",
			target: "0b7c6f1e-58a4-4f6b-9a39-5f0f6a8a1c2d",
			details: { role: "admin" },
			at: "2026-11-02T10:00:00.000Z",
		};
		expect(AuditResponse.parse([entry])).toEqual([entry]);
		expect(
			AuditResponse.safeParse([{ ...entry, action: "delete-everything" }])
				.success,
		).toBe(false);
	});
});
