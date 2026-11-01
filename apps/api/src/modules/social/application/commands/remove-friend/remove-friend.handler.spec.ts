import { InMemoryFriendships } from "../../in-memory-friendships.js";
import { RemoveFriendCommand } from "./remove-friend.command.js";
import { RemoveFriendHandler } from "./remove-friend.handler.js";

describe("RemoveFriendHandler", () => {
	it("ends the friendship for both, and only a friendship", async () => {
		const friendships = new InMemoryFriendships();
		await friendships.befriend("u-1", "u-2", new Date(0));
		const handler = new RemoveFriendHandler(friendships);

		await handler.execute(new RemoveFriendCommand("u-2", "u-1"));

		expect(friendships.friendships.size).toBe(0);
		await expect(
			handler.execute(new RemoveFriendCommand("u-2", "u-1")),
		).rejects.toMatchObject({ code: "social.not-friends" });
	});
});
