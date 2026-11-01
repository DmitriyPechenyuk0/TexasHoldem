import type { IEvent } from "@nestjs/cqrs";
import type { ChatMessage } from "../../domain/chat-message.js";

/** In-process: a message joined a table's chat; the `/chat` gateway sends it to the table's room. */
export class ChatMessagePosted implements IEvent {
	constructor(readonly message: ChatMessage) {}
}
