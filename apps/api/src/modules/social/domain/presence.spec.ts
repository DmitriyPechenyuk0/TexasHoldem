import { NOWHERE, presenceFor } from "./presence.js";

describe("presence", () => {
	it("is offline while not shown online, wherever the player sits", () => {
		expect(presenceFor(NOWHERE, new Set())).toEqual({ status: "offline" });
		expect(
			presenceFor({ online: false, tables: ["t-1"] }, new Set(["t-1"])),
		).toEqual({ status: "offline" });
	});

	it("is online away from tables", () => {
		expect(presenceFor({ online: true, tables: [] }, new Set())).toEqual({
			status: "online",
		});
	});

	it("names the first table the watcher may join, and hides the others", () => {
		const atTables = { online: true, tables: ["t-3", "t-2", "t-1"] };

		expect(presenceFor(atTables, new Set(["t-3", "t-2"]))).toEqual({
			status: "at-table",
			tableId: "t-2",
		});
		expect(presenceFor(atTables, new Set())).toEqual({ status: "playing" });
	});
});
