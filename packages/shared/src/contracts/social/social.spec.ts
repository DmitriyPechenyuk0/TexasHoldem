import {
	FriendsResponse,
	InviteFriendRequest,
	PlayerSearchQuery,
	PlayerSearchResponse,
	SendFriendRequestRequest,
	TableInvitesResponse,
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

	it("invite a friend to a table, by ids", () => {
		const tableId = "5d1f8a0e-2b9c-4e7a-8f3d-6c4b2a1e9f07";
		expect(
			InviteFriendRequest.parse({ friendId: card.userId, tableId }),
		).toEqual({ friendId: card.userId, tableId });
		expect(
			InviteFriendRequest.safeParse({ friendId: "bob", tableId }).success,
		).toBe(false);
		const invite = {
			from: card,
			table: {
				tableId,
				name: "Friday game",
				presetId: "low",
				smallBlind: 5,
				bigBlind: 10,
				maxSeats: 6,
				playerCount: 1,
				handsPlayed: 0,
				visibility: "private",
			},
			expiresAt: "2026-11-02T10:10:00.000Z",
		};
		expect(TableInvitesResponse.parse([invite])).toEqual([invite]);
	});
});
