import { MutesResponse } from "./index.js";

describe("chat contracts", () => {
	it("list muted players as cards, with when they were muted", () => {
		const muted = {
			userId: "0b7c6f1e-58a4-4f6b-9a39-5f0f6a8a1c2d",
			username: "troll",
			nickname: "Troll",
			avatarUrl: null,
			mutedAt: "2026-11-02T10:00:00.000Z",
		};
		expect(MutesResponse.parse([muted])).toEqual([muted]);
		expect(
			MutesResponse.safeParse([{ ...muted, mutedAt: "yesterday" }]).success,
		).toBe(false);
	});
});
