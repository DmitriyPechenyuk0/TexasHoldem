import { CommandHandler, type ICommandHandler, QueryBus } from "@nestjs/cqrs";
import { Clock } from "@/shared/application/clock.js";
import { IntegrationEventBus } from "@/shared/application/integration-events.js";
import { FindPlayerQuery } from "@/shared/application/player-directory.js";
import { sendFriendRequest } from "../../../domain/friendship.js";
import { FriendshipRepository } from "../../../domain/friendship.repository.js";
import { PlayerNotFoundError } from "../../../domain/social-errors.js";
import { FriendRequestSent } from "../../events/friend-request-sent.event.js";
import { FriendshipCreated } from "../../events/friendship-created.event.js";
import {
	type SentFriendRequest,
	SendFriendRequestCommand,
} from "./send-friend-request.command.js";

/** Asks, or befriends at once when the other had asked already; either is told after the commit. */
@CommandHandler(SendFriendRequestCommand)
export class SendFriendRequestHandler implements ICommandHandler<SendFriendRequestCommand> {
	constructor(
		private readonly friendships: FriendshipRepository,
		private readonly queryBus: QueryBus,
		private readonly events: IntegrationEventBus,
		private readonly clock: Clock,
	) {}

	async execute({
		userId,
		toUsername,
	}: SendFriendRequestCommand): Promise<SentFriendRequest> {
		const player = await this.queryBus.execute(new FindPlayerQuery(toUsername));
		if (!player) {
			throw new PlayerNotFoundError();
		}
		const them = player.userId;
		const outcome = await this.friendships.locked(
			[userId, them],
			async (friendships) => {
				const decided = sendFriendRequest(
					await friendships.standing(userId, them),
				);
				if (!decided.ok) {
					throw decided.error;
				}
				const now = this.clock.now();
				if (decided.value === "befriended") {
					await friendships.befriend(userId, them, now);
					this.events.publish(new FriendshipCreated(them, userId));
				} else {
					await friendships.addRequest(userId, them, now);
					this.events.publish(new FriendRequestSent(userId, them));
				}
				return decided.value;
			},
		);
		return { userId: them, outcome };
	}
}
