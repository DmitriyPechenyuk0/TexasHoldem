import { CHAT_MESSAGE_LENGTH } from "@holdem/shared/realtime";
import { Logger } from "@nestjs/common";
import type { EventBus, QueryBus } from "@nestjs/cqrs";
import { PotsAwarded, TableSummaryChanged } from "@/modules/table/index.js";
import type { Clock } from "@/shared/application/clock.js";
import {
	MESSAGE_MAX_LENGTH,
	MESSAGE_MIN_LENGTH,
} from "../domain/chat-message.js";
import { SendChatMessageCommand } from "./commands/send-chat-message/send-chat-message.command.js";
import { SendChatMessageHandler } from "./commands/send-chat-message/send-chat-message.handler.js";
import { ChatMessagePosted } from "./events/chat-message-posted.event.js";
import { ForgetClosedChatsHandler } from "./events/forget-closed-chats.handler.js";
import { PotsAwardedHandler } from "./events/pots-awarded.handler.js";
import { InMemoryChatHistory } from "./in-memory-chat-history.js";
import { GetChatHistoryHandler } from "./queries/get-chat-history/get-chat-history.handler.js";
import { GetChatHistoryQuery } from "./queries/get-chat-history/get-chat-history.query.js";

const NOW = new Date("2026-11-02T10:00:00Z");

function setUp() {
	const history = new InMemoryChatHistory();
	const published: unknown[] = [];
	const queryBus = {
		execute: async ({ userIds }: { userIds: string[] }) =>
			userIds
				.filter((userId) => userId !== "ghost")
				.map((userId) => ({ userId, nickname: `Nick ${userId}` })),
	} as unknown as QueryBus;
	const eventBus = {
		publish: (event: unknown) => published.push(event),
	} as unknown as EventBus;
	const clock = { now: () => NOW } as Clock;
	return {
		history,
		published,
		send: new SendChatMessageHandler(history, queryBus, eventBus, clock),
		pots: new PotsAwardedHandler(history, queryBus, eventBus, clock),
		recent: new GetChatHistoryHandler(history),
	};
}

describe("chat handlers", () => {
	afterEach(() => vi.restoreAllMocks());

	it("keep a player's message with their nickname, and send it on", async () => {
		const { history, published, send, recent } = setUp();

		const message = await send.execute(
			new SendChatMessageCommand("t-1", "u-1", " gl hf "),
		);

		expect(message).toEqual({
			kind: "player",
			id: expect.any(String),
			tableId: "t-1",
			userId: "u-1",
			nickname: "Nick u-1",
			text: "gl hf",
			at: NOW.toISOString(),
		});
		expect(await recent.execute(new GetChatHistoryQuery("t-1"))).toEqual([
			message,
		]);
		expect(published).toEqual([new ChatMessagePosted(message)]);
		await expect(
			send.execute(new SendChatMessageCommand("t-1", "u-1", "")),
		).rejects.toMatchObject({ code: "chat.invalid-length" });
		expect(history.messages.get("t-1")).toHaveLength(1);
		expect({ min: MESSAGE_MIN_LENGTH, max: MESSAGE_MAX_LENGTH }).toEqual(
			CHAT_MESSAGE_LENGTH,
		);
	});

	it("have the dealer announce each pot's winner, with the hand when it was shown", async () => {
		const { published, pots } = setUp();

		await pots.handle(
			new PotsAwarded("t-1", "h-1", [
				{ pot: 0, userId: "u-1", amount: 340, category: "flush" },
				{ pot: 1, userId: "ghost", amount: 20, category: null },
			]),
		);

		expect(
			published.map((event) => (event as ChatMessagePosted).message),
		).toEqual([
			expect.objectContaining({
				kind: "dealer",
				key: "pot-won",
				params: {
					userId: "u-1",
					nickname: "Nick u-1",
					amount: 340,
					category: "flush",
				},
			}),
			expect.objectContaining({
				params: { userId: "ghost", nickname: "", amount: 20 },
			}),
		]);
	});

	it("warn when the dealer cannot speak", async () => {
		const warn = vi
			.spyOn(Logger.prototype, "warn")
			.mockImplementation(() => {});
		const { history, pots } = setUp();
		vi.spyOn(history, "append").mockRejectedValueOnce(new Error("down"));

		await pots.handle(
			new PotsAwarded("t-1", "h-1", [
				{ pot: 0, userId: "u-1", amount: 10, category: null },
			]),
		);

		expect(warn).toHaveBeenCalledWith(
			expect.objectContaining({ msg: "pots not announced" }),
		);
	});

	it("let a closed table's chat expire, and warn when they cannot", async () => {
		const warn = vi
			.spyOn(Logger.prototype, "warn")
			.mockImplementation(() => {});
		const history = new InMemoryChatHistory();
		const handler = new ForgetClosedChatsHandler(history);

		await handler.handle(new TableSummaryChanged("t-1", "open", [], 0));
		await handler.handle(new TableSummaryChanged("t-1", "closed", [], 0));
		vi.spyOn(history, "tableClosed").mockRejectedValueOnce(new Error("down"));
		await handler.handle(new TableSummaryChanged("t-2", "closed", [], 0));

		expect(history.closed).toEqual(["t-1"]);
		expect(warn).toHaveBeenCalledWith(
			expect.objectContaining({ msg: "chat not set to expire" }),
		);
	});
});
