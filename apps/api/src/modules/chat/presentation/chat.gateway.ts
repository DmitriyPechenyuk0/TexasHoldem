import type { Ack } from "@holdem/shared";
import {
	type ChatClientToServerEvents,
	type ChatMessage,
	chatNamespace,
	type ChatServerToClientEvents,
	JoinChatEvent,
	LeaveChatEvent,
	SendChatEvent,
	type SocketData,
} from "@holdem/shared/realtime";
import {
	type OnModuleDestroy,
	type OnModuleInit,
	UseGuards,
} from "@nestjs/common";
import { CommandBus, EventBus, ofType, QueryBus } from "@nestjs/cqrs";
import {
	ConnectedSocket,
	SubscribeMessage,
	WebSocketServer,
} from "@nestjs/websockets";
import type { Subscription } from "rxjs";
import type { DefaultEventsMap, Namespace, Socket } from "socket.io";
import type { z } from "zod";
import { CanJoinTableQuery } from "@/shared/application/table-access.js";
import type { Viewer } from "@/shared/application/viewer.js";
import { CurrentUser } from "@/shared/presentation/auth.guard.js";
import { HttpProblem } from "@/shared/presentation/problem.js";
import { SocketRateLimit } from "@/shared/presentation/realtime/socket-rate-limit.guard.js";
import { RealtimeGateway } from "@/shared/presentation/realtime/realtime-gateway.decorator.js";
import { ValidPayload } from "@/shared/presentation/request-validation.js";
import { RequirePlayer } from "@/shared/presentation/require-player.guard.js";
import { SendChatMessageCommand } from "../application/commands/send-chat-message/send-chat-message.command.js";
import { ChatMessagePosted } from "../application/events/chat-message-posted.event.js";
import { GetChatHistoryQuery } from "../application/queries/get-chat-history/get-chat-history.query.js";

type ChatNamespace = Namespace<
	ChatClientToServerEvents,
	ChatServerToClientEvents,
	DefaultEventsMap,
	SocketData
>;
type ChatSocket = Socket<
	ChatClientToServerEvents,
	ChatServerToClientEvents,
	DefaultEventsMap,
	SocketData
>;
type Payload<Event extends { payload: z.ZodType }> = z.infer<Event["payload"]>;

/** Every socket following one table's chat, on every instance (through the Redis adapter). */
export const chatRoom = (tableId: string): string => `table:${tableId}`;

/** The message as the shared contract types it: its ids are branded there. */
const asContract = (message: unknown): ChatMessage => message as ChatMessage;

/**
 * The `/chat` namespace (POK-104). Joining a table's chat takes access to the table, as joining
 * the table does; it answers the last messages. Whoever follows the chat may write to it, being
 * a verified player: at the table or watching it, since the web app follows both together.
 */
@RealtimeGateway(chatNamespace)
@UseGuards(SocketRateLimit)
export class ChatGateway implements OnModuleInit, OnModuleDestroy {
	@WebSocketServer()
	private readonly server!: ChatNamespace;
	private posted: Subscription | null = null;

	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
		private readonly eventBus: EventBus,
	) {}

	onModuleInit(): void {
		this.posted = this.eventBus
			.pipe(ofType(ChatMessagePosted))
			.subscribe(({ message }) => {
				this.server
					.to(chatRoom(message.tableId))
					.emit("message", asContract(message));
			});
	}

	onModuleDestroy(): void {
		this.posted?.unsubscribe();
	}

	/** Joins the room before reading the history, so no message falls in between. */
	@SubscribeMessage(JoinChatEvent.name)
	async join(
		@ConnectedSocket() socket: ChatSocket,
		@ValidPayload(JoinChatEvent.payload)
		{ tableId }: Payload<typeof JoinChatEvent>,
		@CurrentUser() viewer: Viewer,
	): Promise<Ack<{ messages: ChatMessage[] }>> {
		const allowed = await this.queryBus.execute(
			new CanJoinTableQuery(tableId, viewer.userId),
		);
		if (!allowed) {
			throw new HttpProblem(
				403,
				"chat.access-denied",
				"No access to this table's chat",
			);
		}
		await socket.join(chatRoom(tableId));
		const messages = await this.queryBus.execute(
			new GetChatHistoryQuery(tableId),
		);
		return { ok: true, data: { messages: messages.map(asContract) } };
	}

	@SubscribeMessage(LeaveChatEvent.name)
	async leave(
		@ConnectedSocket() socket: ChatSocket,
		@ValidPayload(LeaveChatEvent.payload)
		{ tableId }: Payload<typeof LeaveChatEvent>,
	): Promise<Ack<Record<string, never>>> {
		await socket.leave(chatRoom(tableId));
		return { ok: true, data: {} };
	}

	@SubscribeMessage(SendChatEvent.name)
	@UseGuards(RequirePlayer)
	async send(
		@ConnectedSocket() socket: ChatSocket,
		@ValidPayload(SendChatEvent.payload)
		{ tableId, text }: Payload<typeof SendChatEvent>,
		@CurrentUser() viewer: Viewer,
	): Promise<Ack<ChatMessage>> {
		if (!socket.rooms.has(chatRoom(tableId))) {
			throw new HttpProblem(
				409,
				"chat.not-joined",
				"Join the table's chat first",
			);
		}
		const message = await this.commandBus.execute(
			new SendChatMessageCommand(tableId, viewer.userId, text),
		);
		return { ok: true, data: asContract(message) };
	}
}
