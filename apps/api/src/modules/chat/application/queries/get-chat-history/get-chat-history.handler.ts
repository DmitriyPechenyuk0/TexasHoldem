import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import type { ChatMessage } from "../../../domain/chat-message.js";
import { ChatHistory } from "../../chat-history.js";
import { GetChatHistoryQuery } from "./get-chat-history.query.js";

@QueryHandler(GetChatHistoryQuery)
export class GetChatHistoryHandler implements IQueryHandler<GetChatHistoryQuery> {
	constructor(private readonly history: ChatHistory) {}

	execute({ tableId }: GetChatHistoryQuery): Promise<readonly ChatMessage[]> {
		return this.history.recent(tableId);
	}
}
