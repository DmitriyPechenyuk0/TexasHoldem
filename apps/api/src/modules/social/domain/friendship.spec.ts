import {
	acceptFriendRequest,
	cancelFriendRequest,
	declineFriendRequest,
	MAX_FRIENDS,
	MAX_PENDING_REQUESTS,
	removeFriend,
	sendFriendRequest,
	type Standing,
} from "./friendship.js";

const strangers: Standing = {
	me: "u-1",
	them: "u-2",
	friends: false,
	requested: false,
	requestedBack: false,
	myFriends: 0,
	theirFriends: 0,
	myPendingRequests: 0,
};

const codeOf = (result: { ok: boolean; error?: { code: string } }) =>
	result.ok ? "ok" : result.error?.code;

describe("friendship", () => {
	describe("a request", () => {
		it("waits for an answer, or answers theirs", () => {
			expect(sendFriendRequest(strangers)).toEqual({
				ok: true,
				value: "requested",
			});
			expect(sendFriendRequest({ ...strangers, requestedBack: true })).toEqual({
				ok: true,
				value: "befriended",
			});
		});

		it("goes to someone else, once, and not to a friend", () => {
			expect(codeOf(sendFriendRequest({ ...strangers, them: "u-1" }))).toBe(
				"social.self-request",
			);
			expect(codeOf(sendFriendRequest({ ...strangers, friends: true }))).toBe(
				"social.already-friends",
			);
			expect(codeOf(sendFriendRequest({ ...strangers, requested: true }))).toBe(
				"social.request-pending",
			);
		});

		it("needs room on both lists", () => {
			expect(
				codeOf(sendFriendRequest({ ...strangers, myFriends: MAX_FRIENDS })),
			).toBe("social.too-many-friends");
			expect(
				codeOf(sendFriendRequest({ ...strangers, theirFriends: MAX_FRIENDS })),
			).toBe("social.friend-list-full");
			expect(
				codeOf(
					sendFriendRequest({
						...strangers,
						requestedBack: true,
						theirFriends: MAX_FRIENDS,
					}),
				),
			).toBe("social.friend-list-full");
		});

		it("waits with only a few others, though answering theirs is always fine", () => {
			const busy = { ...strangers, myPendingRequests: MAX_PENDING_REQUESTS };

			expect(codeOf(sendFriendRequest(busy))).toBe("social.too-many-requests");
			expect(codeOf(sendFriendRequest({ ...busy, requestedBack: true }))).toBe(
				"ok",
			);
			expect(
				codeOf(
					sendFriendRequest({
						...strangers,
						myPendingRequests: MAX_PENDING_REQUESTS - 1,
					}),
				),
			).toBe("ok");
		});
	});

	it("is accepted only when it waits, and only with room on both lists", () => {
		const asked = { ...strangers, requestedBack: true };

		expect(codeOf(acceptFriendRequest(asked))).toBe("ok");
		expect(codeOf(acceptFriendRequest(strangers))).toBe(
			"social.request-not-found",
		);
		expect(
			codeOf(acceptFriendRequest({ ...asked, myFriends: MAX_FRIENDS })),
		).toBe("social.too-many-friends");
		expect(
			codeOf(acceptFriendRequest({ ...asked, theirFriends: MAX_FRIENDS })),
		).toBe("social.friend-list-full");
	});

	it("is declined by the one asked, and cancelled by the one asking", () => {
		expect(
			codeOf(declineFriendRequest({ ...strangers, requestedBack: true })),
		).toBe("ok");
		expect(
			codeOf(declineFriendRequest({ ...strangers, requested: true })),
		).toBe("social.request-not-found");
		expect(codeOf(cancelFriendRequest({ ...strangers, requested: true }))).toBe(
			"ok",
		);
		expect(
			codeOf(cancelFriendRequest({ ...strangers, requestedBack: true })),
		).toBe("social.request-not-found");
	});

	it("ends a friendship only between friends", () => {
		expect(codeOf(removeFriend({ ...strangers, friends: true }))).toBe("ok");
		expect(codeOf(removeFriend(strangers))).toBe("social.not-friends");
	});
});
