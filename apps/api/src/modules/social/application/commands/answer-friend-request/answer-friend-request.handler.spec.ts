import type { Clock } from "@/shared/application/clock.js";
import type { IntegrationEventBus } from "@/shared/application/integration-events.js";
import { FriendshipCreated } from "../../events/friendship-created.event.js";
import {
	handlerPorts,
	InMemoryFriendships,
	NOW,
} from "../../in-memory-friendships.js";
import { AnswerFriendRequestCommand } from "./answer-friend-request.command.js";
import { AnswerFriendRequestHandler } from "./answer-friend-request.handler.js";

async function setUp() {
	const friendships = new InMemoryFriendships();
	await friendships.addRequest("u-2", "u-1", new Date(0));
	const { published, events, clock } = handlerPorts();
	const handler = new AnswerFriendRequestHandler(
		friendships,
		events as unknown as IntegrationEventBus,
		clock as Clock,
	);
	return { friendships, published, handler };
}

describe("AnswerFriendRequestHandler", () => {
	it("befriends the two on accepting, and tells of it", async () => {
		const { friendships, published, handler } = await setUp();

		await handler.execute(
			new AnswerFriendRequestCommand("u-1", "u-2", "accept"),
		);

		expect(friendships.requests.size).toBe(0);
		expect(friendships.friendships.get("u-2→u-1")).toEqual(NOW);
		expect(friendships.locks).toEqual([["u-1", "u-2"]]);
		expect(published).toEqual([new FriendshipCreated("u-2", "u-1")]);
	});

	it("drops the request on declining, telling nobody", async () => {
		const { friendships, published, handler } = await setUp();

		await handler.execute(
			new AnswerFriendRequestCommand("u-1", "u-2", "decline"),
		);

		expect(friendships.requests.size).toBe(0);
		expect(friendships.friendships.size).toBe(0);
		expect(published).toEqual([]);
	});

	it("answers only a request that waits for this player", async () => {
		const { handler } = await setUp();

		for (const answer of ["accept", "decline"] as const) {
			await expect(
				handler.execute(new AnswerFriendRequestCommand("u-2", "u-1", answer)),
			).rejects.toMatchObject({ code: "social.request-not-found" });
		}
	});
});
