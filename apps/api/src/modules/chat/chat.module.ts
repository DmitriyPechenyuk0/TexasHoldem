import { Module } from "@nestjs/common";
import { ChatHistory } from "./application/chat-history.js";
import { SendChatMessageHandler } from "./application/commands/send-chat-message/send-chat-message.handler.js";
import { ForgetClosedChatsHandler } from "./application/events/forget-closed-chats.handler.js";
import { PotsAwardedHandler } from "./application/events/pots-awarded.handler.js";
import { GetChatHistoryHandler } from "./application/queries/get-chat-history/get-chat-history.handler.js";
import { RedisChatHistory } from "./infrastructure/redis-chat-history.js";
import { ChatGateway } from "./presentation/chat.gateway.js";

/**
 * Each table's chat, on the `/chat` namespace: what its players and spectators say, and what the
 * dealer announces from the table's events. Only the last messages are kept, in Redis.
 */
@Module({
	providers: [
		{ provide: ChatHistory, useClass: RedisChatHistory },
		SendChatMessageHandler,
		GetChatHistoryHandler,
		PotsAwardedHandler,
		ForgetClosedChatsHandler,
		ChatGateway,
	],
})
export class ChatModule {}
