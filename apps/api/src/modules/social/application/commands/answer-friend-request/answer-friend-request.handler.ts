import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { Clock } from "@/shared/application/clock.js";
import { IntegrationEventBus } from "@/shared/application/integration-events.js";
import {
	acceptFriendRequest,
	declineFriendRequest,
} from "../../../domain/friendship.js";
import { FriendshipRepository } from "../../../domain/friendship.repository.js";
import { FriendshipCreated } from "../../events/friendship-created.event.js";
import { AnswerFriendRequestCommand } from "./answer-friend-request.command.js";

@CommandHandler(AnswerFriendRequestCommand)
export class AnswerFriendRequestHandler implements ICommandHandler<AnswerFriendRequestCommand> {
	constructor(
		private readonly friendships: FriendshipRepository,
		private readonly events: IntegrationEventBus,
		private readonly clock: Clock,
	) {}

	execute({
		userId,
		fromId,
		answer,
	}: AnswerFriendRequestCommand): Promise<void> {
		return this.friendships.locked([userId, fromId], async (friendships) => {
			const standing = await friendships.standing(userId, fromId);
			const decided =
				answer === "accept"
					? acceptFriendRequest(standing)
					: declineFriendRequest(standing);
			if (!decided.ok) {
				throw decided.error;
			}
			if (answer === "accept") {
				await friendships.befriend(userId, fromId, this.clock.now());
				this.events.publish(new FriendshipCreated(fromId, userId));
			} else {
				await friendships.removeRequest(fromId, userId);
			}
		});
	}
}
