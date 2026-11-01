import { InMemoryFriendships } from "../../in-memory-friendships.js";
import { CancelFriendRequestCommand } from "./cancel-friend-request.command.js";
import { CancelFriendRequestHandler } from "./cancel-friend-request.handler.js";

describe("CancelFriendRequestHandler", () => {
	it("takes back the player's own request, and only theirs", async () => {
		const friendships = new InMemoryFriendships();
		await friendships.addRequest("u-1", "u-2", new Date(0));
		const handler = new CancelFriendRequestHandler(friendships);

		await expect(
			handler.execute(new CancelFriendRequestCommand("u-2", "u-1")),
		).rejects.toMatchObject({ code: "social.request-not-found" });
		await handler.execute(new CancelFriendRequestCommand("u-1", "u-2"));

		expect(friendships.requests.size).toBe(0);
	});
});
