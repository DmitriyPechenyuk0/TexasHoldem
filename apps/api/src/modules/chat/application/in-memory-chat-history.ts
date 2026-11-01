import type { ChatMessage } from "../domain/chat-message.js";
import { ChatHistory, HISTORY_LENGTH } from "./chat-history.js";

/** The history for handler tests, with the Redis one's cap; `closed` lists the tables closed. */
export class InMemoryChatHistory extends ChatHistory {
	readonly messages = new Map<string, ChatMessage[]>();
	readonly closed: string[] = [];

	async append(message: ChatMessage): Promise<void> {
		const messages = [...(this.messages.get(message.tableId) ?? []), message];
		this.messages.set(message.tableId, messages.slice(-HISTORY_LENGTH));
	}

	async recent(tableId: string): Promise<readonly ChatMessage[]> {
		return this.messages.get(tableId) ?? [];
	}

	async tableClosed(tableId: string): Promise<void> {
		this.closed.push(tableId);
	}
}
