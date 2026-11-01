import { randomUUID } from "node:crypto";
import {
	CommandHandler,
	EventBus,
	type ICommandHandler,
	QueryBus,
} from "@nestjs/cqrs";
import { Clock } from "@/shared/application/clock.js";
import { GetPlayerCardsQuery } from "@/shared/application/player-directory.js";
import { RepeatedMessageError } from "../../../domain/chat-errors.js";
import {
	type ChatMessage,
	messageText,
	repeatsLast,
} from "../../../domain/chat-message.js";
import { ChatHistory } from "../../chat-history.js";
import { ChatMessagePosted } from "../../events/chat-message-posted.event.js";
import { SendChatMessageCommand } from "./send-chat-message.command.js";

/**
 * Keeps the message in the table's history, then sends it to everyone following the chat. Its
 * profanity is masked, and the player's last message is not repeated within half a minute.
 */
@CommandHandler(SendChatMessageCommand)
export class SendChatMessageHandler implements ICommandHandler<SendChatMessageCommand> {
	constructor(
		private readonly history: ChatHistory,
		private readonly queryBus: QueryBus,
		private readonly eventBus: EventBus,
		private readonly clock: Clock,
	) {}

	async execute({
		tableId,
		userId,
		text,
	}: SendChatMessageCommand): Promise<ChatMessage> {
		const said = messageText(text);
		if (!said.ok) {
			throw said.error;
		}
		const now = this.clock.now();
		if (
			repeatsLast(said.value, userId, await this.history.recent(tableId), now)
		) {
			throw new RepeatedMessageError();
		}
		const [card] = await this.queryBus.execute(
			new GetPlayerCardsQuery([userId]),
		);
		const message: ChatMessage = {
			kind: "player",
			id: randomUUID(),
			tableId,
			userId,
			nickname: card?.nickname ?? "",
			text: said.value,
			at: now.toISOString(),
		};
		await this.history.append(message);
		this.eventBus.publish(new ChatMessagePosted(message));
		return message;
	}
}
