import type { ChatMessage } from "../domain/chat-message.js";

/** How many of a table's last messages are kept, and sent to whoever joins its chat. */
export const HISTORY_LENGTH = 50;

/**
 * Port for each table's last messages, shared by every instance. Not kept in Postgres (POK-104):
 * a table's chat is gone an hour after the table closes.
 */
export abstract class ChatHistory {
	abstract append(message: ChatMessage): Promise<void>;

	/** The table's last messages, oldest first. */
	abstract recent(tableId: string): Promise<readonly ChatMessage[]>;

	/** The table closed: its messages go an hour from now. */
	abstract tableClosed(tableId: string): Promise<void>;
}
