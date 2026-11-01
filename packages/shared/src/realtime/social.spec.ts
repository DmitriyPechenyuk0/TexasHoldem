import { socialNamespace } from "./social.js";

const userId = "0b7c6f1e-58a4-4f6b-9a39-5f0f6a8a1c2d";
const tableId = "5d1f8a0e-2b9c-4e7a-8f3d-6c4b2a1e9f07";

describe("social realtime contracts", () => {
	it("ask for the friends' presence, then get its changes and friend requests", () => {
		expect(Object.keys(socialNamespace.clientToServer)).toEqual([
			"friends-presence",
		]);
		expect(Object.keys(socialNamespace.serverToClient)).toEqual([
			"presence-changed",
			"friend-request-received",
			"friend-added",
			"session-expired",
		]);
	});

	it("show a table's id only with the presence that names one", () => {
		const changed = socialNamespace.serverToClient["presence-changed"].payload;

		for (const presence of [
			{ status: "offline" },
			{ status: "online" },
			{ status: "playing" },
			{ status: "at-table", tableId },
		]) {
			expect(changed.parse({ userId, presence })).toEqual({
				userId,
				presence,
			});
		}
		expect(
			changed.parse({ userId, presence: { status: "playing", tableId } }),
		).toEqual({ userId, presence: { status: "playing" } });
		expect(
			changed.safeParse({ userId, presence: { status: "at-table" } }).success,
		).toBe(false);
	});
});
