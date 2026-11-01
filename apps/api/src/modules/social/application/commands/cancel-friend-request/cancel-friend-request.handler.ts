import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { cancelFriendRequest } from "../../../domain/friendship.js";
import { FriendshipRepository } from "../../../domain/friendship.repository.js";
import { CancelFriendRequestCommand } from "./cancel-friend-request.command.js";

@CommandHandler(CancelFriendRequestCommand)
export class CancelFriendRequestHandler implements ICommandHandler<CancelFriendRequestCommand> {
	constructor(private readonly friendships: FriendshipRepository) {}

	execute({ userId, toId }: CancelFriendRequestCommand): Promise<void> {
		return this.friendships.locked([userId, toId], async (friendships) => {
			const decided = cancelFriendRequest(
				await friendships.standing(userId, toId),
			);
			if (!decided.ok) {
				throw decided.error;
			}
			await friendships.removeRequest(userId, toId);
		});
	}
}
