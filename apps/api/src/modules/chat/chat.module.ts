import { Module } from "@nestjs/common";
import { ChatHistory } from "./application/chat-history.js";
import { MutePlayerHandler } from "./application/commands/mute-player/mute-player.handler.js";
import { UnmutePlayerHandler } from "./application/commands/unmute-player/unmute-player.handler.js";
import { GetMutedIdsHandler } from "./application/queries/get-muted-ids/get-muted-ids.handler.js";
import { GetMutesHandler } from "./application/queries/get-mutes/get-mutes.handler.js";
import { MuteListRepository } from "./domain/mute-list.repository.js";
import { DrizzleMuteListRepository } from "./infrastructure/persistence/drizzle-mute-list.repository.js";
import { ChatController } from "./presentation/chat.controller.js";
import { SendChatMessageHandler } from "./application/commands/send-chat-message/send-chat-message.handler.js";
import { ForgetClosedChatsHandler } from "./application/events/forget-closed-chats.handler.js";
import { PotsAwardedHandler } from "./application/events/pots-awarded.handler.js";
import { GetChatHistoryHandler } from "./application/queries/get-chat-history/get-chat-history.handler.js";
import { RedisChatHistory } from "./infrastructure/redis-chat-history.js";
import { ChatGateway } from "./presentation/chat.gateway.js";

/**
 * Each table's chat, on the `/chat` namespace: what its players and spectators say, and what the
 * dealer announces from the table's events. Only the last messages are kept, in Redis; whom each
 * player muted is kept in Postgres.
 */
@Module({
	controllers: [ChatController],
	providers: [
		{ provide: ChatHistory, useClass: RedisChatHistory },
		{ provide: MuteListRepository, useClass: DrizzleMuteListRepository },
		MutePlayerHandler,
		UnmutePlayerHandler,
		GetMutesHandler,
		GetMutedIdsHandler,
		SendChatMessageHandler,
		GetChatHistoryHandler,
		PotsAwardedHandler,
		ForgetClosedChatsHandler,
		ChatGateway,
	],
})
export class ChatModule {}
