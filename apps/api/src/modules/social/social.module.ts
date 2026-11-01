import { Module } from "@nestjs/common";
import { AnswerFriendRequestHandler } from "./application/commands/answer-friend-request/answer-friend-request.handler.js";
import { CancelFriendRequestHandler } from "./application/commands/cancel-friend-request/cancel-friend-request.handler.js";
import { RemoveFriendHandler } from "./application/commands/remove-friend/remove-friend.handler.js";
import { SendFriendRequestHandler } from "./application/commands/send-friend-request/send-friend-request.handler.js";
import { GetFriendRequestsHandler } from "./application/queries/get-friend-requests/get-friend-requests.handler.js";
import { GetFriendsHandler } from "./application/queries/get-friends/get-friends.handler.js";
import { LookUpPlayersHandler } from "./application/queries/look-up-players/look-up-players.handler.js";
import { FriendshipRepository } from "./domain/friendship.repository.js";
import { DrizzleFriendshipRepository } from "./infrastructure/persistence/drizzle-friendship.repository.js";
import { SocialController } from "./presentation/social.controller.js";

/**
 * Who plays with whom: friend requests and friendships. Players are shown by the cards the profile
 * context answers (`shared/application/player-directory.ts`).
 */
@Module({
	controllers: [SocialController],
	providers: [
		{ provide: FriendshipRepository, useClass: DrizzleFriendshipRepository },
		SendFriendRequestHandler,
		AnswerFriendRequestHandler,
		CancelFriendRequestHandler,
		RemoveFriendHandler,
		GetFriendsHandler,
		GetFriendRequestsHandler,
		LookUpPlayersHandler,
	],
})
export class SocialModule {}
