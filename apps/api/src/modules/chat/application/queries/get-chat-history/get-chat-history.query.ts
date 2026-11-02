import { Query } from "@nestjs/cqrs";
import type { ChatMessage } from "../../../domain/chat-message.js";

/** The table's last messages, oldest first. */
export class GetChatHistoryQuery extends Query<readonly ChatMessage[]> {
	constructor(readonly tableId: string) {
		super();
	}
}
