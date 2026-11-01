import { Module } from "@nestjs/common";
import { AnswerFriendRequestHandler } from "./application/commands/answer-friend-request/answer-friend-request.handler.js";
import { CancelFriendRequestHandler } from "./application/commands/cancel-friend-request/cancel-friend-request.handler.js";
import { ConnectToSocialHandler } from "./application/commands/connect-to-social/connect-to-social.handler.js";
import { DisconnectFromSocialHandler } from "./application/commands/disconnect-from-social/disconnect-from-social.handler.js";
import { RemoveFriendHandler } from "./application/commands/remove-friend/remove-friend.handler.js";
import { SendFriendRequestHandler } from "./application/commands/send-friend-request/send-friend-request.handler.js";
import { SeatsForPresenceHandler } from "./application/events/seats-for-presence.handler.js";
import { PlayerPresence } from "./application/player-presence.js";
import { PresenceSettler } from "./application/presence-settler.js";
import { GetFriendRequestsHandler } from "./application/queries/get-friend-requests/get-friend-requests.handler.js";
import { GetFriendsPresenceHandler } from "./application/queries/get-friends-presence/get-friends-presence.handler.js";
import { GetFriendsHandler } from "./application/queries/get-friends/get-friends.handler.js";
import { GetPresenceWatchersHandler } from "./application/queries/get-presence-watchers/get-presence-watchers.handler.js";
import { LookUpPlayersHandler } from "./application/queries/look-up-players/look-up-players.handler.js";
import { FriendshipRepository } from "./domain/friendship.repository.js";
import { DrizzleFriendshipRepository } from "./infrastructure/persistence/drizzle-friendship.repository.js";
import { RedisPlayerPresence } from "./infrastructure/redis-player-presence.js";
import { SocialController } from "./presentation/social.controller.js";
import { SocialGateway } from "./presentation/social.gateway.js";

/**
 * Who plays with whom: friend requests and friendships, and where friends are (presence, on the
 * `/social` namespace). Players are shown by the cards the profile context answers
 * (`shared/application/player-directory.ts`).
 */
@Module({
	controllers: [SocialController],
	providers: [
		{ provide: FriendshipRepository, useClass: DrizzleFriendshipRepository },
		{ provide: PlayerPresence, useClass: RedisPlayerPresence },
		SendFriendRequestHandler,
		AnswerFriendRequestHandler,
		CancelFriendRequestHandler,
		RemoveFriendHandler,
		ConnectToSocialHandler,
		DisconnectFromSocialHandler,
		PresenceSettler,
		SeatsForPresenceHandler,
		GetFriendsHandler,
		GetFriendRequestsHandler,
		LookUpPlayersHandler,
		GetFriendsPresenceHandler,
		GetPresenceWatchersHandler,
		SocialGateway,
	],
})
export class SocialModule {}
