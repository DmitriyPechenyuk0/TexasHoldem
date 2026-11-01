import {
	FriendsResponse,
	PlayerSearchQuery,
	PlayerSearchResponse,
	SendFriendRequestRequest,
} from "./index.js";

const card = {
	userId: "0b7c6f1e-58a4-4f6b-9a39-5f0f6a8a1c2d",
	username: "alice_01",
	nickname: "Alice",
	avatarUrl: null,
};

describe("social contracts", () => {
	it("ask for a friend by a valid username", () => {
		expect(SendFriendRequestRequest.parse({ username: "Alice_01" })).toEqual({
			username: "Alice_01",
		});
		for (const username of ["al", "alice 01", "a".repeat(21)]) {
			expect(SendFriendRequestRequest.safeParse({ username }).success).toBe(
				false,
			);
		}
	});

	it("search by a username's beginning", () => {
		expect(PlayerSearchQuery.safeParse({ q: "a" }).success).toBe(true);
		for (const q of ["", "a%", "a".repeat(21)]) {
			expect(PlayerSearchQuery.safeParse({ q }).success).toBe(false);
		}
	});

	it("show friends and search results as player cards", () => {
		const since = "2026-11-02T10:00:00.000Z";
		expect(FriendsResponse.parse([{ ...card, since }])).toEqual([
			{ ...card, since },
		]);
		expect(
			PlayerSearchResponse.safeParse([{ ...card, relation: "requested-you" }])
				.success,
		).toBe(true);
		expect(
			PlayerSearchResponse.safeParse([{ ...card, relation: "blocked" }])
				.success,
		).toBe(false);
	});
});
