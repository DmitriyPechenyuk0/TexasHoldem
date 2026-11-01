import { Logger } from "@nestjs/common";
import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";
import { TableSummaryChanged } from "@/modules/table/index.js";
import { ChatHistory } from "../chat-history.js";

/** A closed table's chat is kept an hour more, for whoever is still reading it. */
@EventsHandler(TableSummaryChanged)
export class ForgetClosedChatsHandler implements IEventHandler<TableSummaryChanged> {
	private readonly logger = new Logger(ForgetClosedChatsHandler.name);

	constructor(private readonly history: ChatHistory) {}

	async handle({ tableId, status }: TableSummaryChanged): Promise<void> {
		if (status !== "closed") {
			return;
		}
		await this.history.tableClosed(tableId).catch((error: unknown) =>
			this.logger.warn({
				msg: "chat not set to expire",
				tableId,
				err: error,
			}),
		);
	}
}
