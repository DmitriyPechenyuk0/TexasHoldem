import {
	FriendRequestSentV1,
	FriendshipCreatedV1,
	IntegrationEventEnvelope,
	UserRegisteredV1,
	UserVerifiedV1,
} from "./index.js";

const userId = "0b7c6f1e-58a4-4f6b-9a39-5f0f6a8a1c2d";

describe("integration events", () => {
	it("carry a sender, a dotted name and a version around their data", () => {
		const envelope = {
			from: "instance-1",
			name: "identity.user-registered",
			v: 1,
			data: { userId, username: "alice", locale: "en" },
		};
		expect(IntegrationEventEnvelope.parse(envelope)).toEqual(envelope);
		for (const name of [
			"user-registered",
			"Identity.UserRegistered",
			"a.b.c",
		]) {
			expect(
				IntegrationEventEnvelope.safeParse({ ...envelope, name }).success,
			).toBe(false);
		}
		expect(
			IntegrationEventEnvelope.safeParse({ ...envelope, v: 0 }).success,
		).toBe(false);
	});

	it("describe the identity context's events", () => {
		expect(
			UserRegisteredV1.parse({ userId, username: "alice", locale: "ru" }),
		).toEqual({ userId, username: "alice", locale: "ru" });
		expect(
			UserRegisteredV1.safeParse({ userId, username: "", locale: "en" })
				.success,
		).toBe(false);
		expect(UserVerifiedV1.safeParse({ userId: "nope" }).success).toBe(false);
	});

	it("describe the social context's events", () => {
		const otherId = "5d1f8a0e-2b9c-4e7a-8f3d-6c4b2a1e9f07";
		expect(
			FriendRequestSentV1.parse({ fromId: userId, toId: otherId }),
		).toEqual({ fromId: userId, toId: otherId });
		expect(
			FriendshipCreatedV1.safeParse({ requesterId: userId, accepterId: "x" })
				.success,
		).toBe(false);
	});
});
