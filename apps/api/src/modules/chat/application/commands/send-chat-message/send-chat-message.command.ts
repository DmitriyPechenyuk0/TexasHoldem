import { Command } from "@nestjs/cqrs";
import type { ChatMessage } from "../../../domain/chat-message.js";

/** A player says something in a table's chat; answers the message as everyone gets it. */
export class SendChatMessageCommand extends Command<ChatMessage> {
	constructor(
		readonly tableId: string,
		readonly userId: string,
		readonly text: string,
	) {
		super();
	}
}
