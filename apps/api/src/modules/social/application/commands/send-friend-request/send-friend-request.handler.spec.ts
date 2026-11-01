import { FRIEND_LIMITS } from "@holdem/shared/contracts/social";
import type { QueryBus } from "@nestjs/cqrs";
import type { Clock } from "@/shared/application/clock.js";
import type { IntegrationEventBus } from "@/shared/application/integration-events.js";
import type { PlayerCard } from "@/shared/application/player-directory.js";
import {
	MAX_FRIENDS,
	MAX_PENDING_REQUESTS,
} from "../../../domain/friendship.js";
import { FriendRequestSent } from "../../events/friend-request-sent.event.js";
import { FriendshipCreated } from "../../events/friendship-created.event.js";
import {
	handlerPorts,
	InMemoryFriendships,
	NOW,
} from "../../in-memory-friendships.js";
import { SendFriendRequestCommand } from "./send-friend-request.command.js";
import { SendFriendRequestHandler } from "./send-friend-request.handler.js";

const bob: PlayerCard = {
	userId: "u-2",
	username: "bob",
	nickname: "Bob",
	avatarUrl: null,
};

function setUp() {
	const friendships = new InMemoryFriendships();
	const { published, events, clock } = handlerPorts();
	const queryBus = {
		execute: async ({ username }: { username: string }) =>
			username.toLowerCase() === "bob" ? bob : null,
	} as unknown as QueryBus;
	const handler = new SendFriendRequestHandler(
		friendships,
		queryBus,
		events as unknown as IntegrationEventBus,
		clock as Clock,
	);
	return { friendships, published, handler };
}

describe("SendFriendRequestHandler", () => {
	it("asks the player by username, with both players locked, and tells of it", async () => {
		const { friendships, published, handler } = setUp();

		await expect(
			handler.execute(new SendFriendRequestCommand("u-1", "Bob")),
		).resolves.toEqual({ userId: "u-2", outcome: "requested" });

		expect(friendships.requests).toEqual(new Map([["u-1→u-2", NOW]]));
		expect(friendships.locks).toEqual([["u-1", "u-2"]]);
		expect(published).toEqual([new FriendRequestSent("u-1", "u-2")]);
	});

	it("befriends at once when the other had asked already", async () => {
		const { friendships, published, handler } = setUp();
		await friendships.addRequest("u-2", "u-1", new Date(0));

		await expect(
			handler.execute(new SendFriendRequestCommand("u-1", "bob")),
		).resolves.toEqual({ userId: "u-2", outcome: "befriended" });

		expect(friendships.requests.size).toBe(0);
		expect(friendships.friendships.get("u-1→u-2")).toEqual(NOW);
		expect(published).toEqual([new FriendshipCreated("u-2", "u-1")]);
	});

	it("refuses an unknown player and a broken rule, and tells of nothing", async () => {
		const { friendships, published, handler } = setUp();
		await friendships.addRequest("u-1", "u-2", new Date(0));

		await expect(
			handler.execute(new SendFriendRequestCommand("u-1", "nobody")),
		).rejects.toMatchObject({ code: "social.player-not-found" });
		await expect(
			handler.execute(new SendFriendRequestCommand("u-1", "bob")),
		).rejects.toMatchObject({ code: "social.request-pending" });
		expect(published).toEqual([]);
	});

	it("holds the limits the shared contract gives clients", () => {
		expect({
			friends: MAX_FRIENDS,
			pendingRequests: MAX_PENDING_REQUESTS,
		}).toEqual(FRIEND_LIMITS);
	});
});
