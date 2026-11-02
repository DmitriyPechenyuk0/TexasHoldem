import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { removeFriend } from "../../../domain/friendship.js";
import { FriendshipRepository } from "../../../domain/friendship.repository.js";
import { RemoveFriendCommand } from "./remove-friend.command.js";

@CommandHandler(RemoveFriendCommand)
export class RemoveFriendHandler implements ICommandHandler<RemoveFriendCommand> {
	constructor(private readonly friendships: FriendshipRepository) {}

	execute({ userId, friendId }: RemoveFriendCommand): Promise<void> {
		return this.friendships.locked([userId, friendId], async (friendships) => {
			const decided = removeFriend(
				await friendships.standing(userId, friendId),
			);
			if (!decided.ok) {
				throw decided.error;
			}
			await friendships.unfriend(userId, friendId);
		});
	}
}
