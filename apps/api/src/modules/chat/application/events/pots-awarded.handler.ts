import { randomUUID } from "node:crypto";
import { Logger } from "@nestjs/common";
import {
	EventBus,
	EventsHandler,
	type IEventHandler,
	QueryBus,
} from "@nestjs/cqrs";
import { PotsAwarded } from "@/modules/table/index.js";
import { Clock } from "@/shared/application/clock.js";
import { GetPlayerCardsQuery } from "@/shared/application/player-directory.js";
import type { ChatMessage } from "../../domain/chat-message.js";
import { ChatHistory } from "../chat-history.js";
import { ChatMessagePosted } from "./chat-message-posted.event.js";

/** The dealer announces who won each pot: "Alice wins 340 with a flush", worded by the client. */
@EventsHandler(PotsAwarded)
export class PotsAwardedHandler implements IEventHandler<PotsAwarded> {
	private readonly logger = new Logger(PotsAwardedHandler.name);

	constructor(
		private readonly history: ChatHistory,
		private readonly queryBus: QueryBus,
		private readonly eventBus: EventBus,
		private readonly clock: Clock,
	) {}

	async handle({ tableId, awards }: PotsAwarded): Promise<void> {
		try {
			const cards = await this.queryBus.execute(
				new GetPlayerCardsQuery([
					...new Set(awards.map(({ userId }) => userId)),
				]),
			);
			const nicknames = new Map(
				cards.map(({ userId, nickname }) => [userId, nickname]),
			);
			const at = this.clock.now().toISOString();
			for (const { userId, amount, category } of awards) {
				const message: ChatMessage = {
					kind: "dealer",
					id: randomUUID(),
					tableId,
					key: "pot-won",
					params: {
						userId,
						nickname: nicknames.get(userId) ?? "",
						amount,
						...(category === null ? {} : { category }),
					},
					at,
				};
				await this.history.append(message);
				this.eventBus.publish(new ChatMessagePosted(message));
			}
		} catch (error) {
			this.logger.warn({ msg: "pots not announced", tableId, err: error });
		}
	}
}
