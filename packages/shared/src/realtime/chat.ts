import { z } from "zod";
import { TableId, UserId } from "../contracts/common/ids.js";
import {
	type ClientToServerEvents,
	defineEvent,
	defineNamespace,
	NAMESPACES,
	type ServerToClientEvents,
} from "./define.js";

/** A chat message's length, in characters, once trimmed. */
export const CHAT_MESSAGE_LENGTH = { min: 1, max: 200 } as const;

/** A player's message: their text, with the nickname they had when they sent it. */
export const PlayerChatMessage = z.object({
	kind: z.literal("player"),
	id: z.uuid(),
	tableId: TableId,
	userId: UserId,
	nickname: z.string(),
	text: z.string(),
	at: z.iso.datetime(),
});
export type PlayerChatMessage = z.infer<typeof PlayerChatMessage>;

/**
 * What the dealer announces, for the client to word in its language: `key` names the message and
 * `params` fill it in.
 *
 * - `pot-won`: `{ userId, nickname, amount, category? }`. `category` is the winning hand's (as
 *   `HAND_CATEGORIES` of the engine), absent when it was never shown.
 */
export const DealerChatMessage = z.object({
	kind: z.literal("dealer"),
	id: z.uuid(),
	tableId: TableId,
	key: z.enum(["pot-won"]),
	params: z.record(z.string(), z.union([z.string(), z.number()])),
	at: z.iso.datetime(),
});
export type DealerChatMessage = z.infer<typeof DealerChatMessage>;

export const ChatMessage = z.discriminatedUnion("kind", [
	PlayerChatMessage,
	DealerChatMessage,
]);
export type ChatMessage = z.infer<typeof ChatMessage>;

const tablePayload = <Shape extends z.ZodRawShape>(shape: Shape) =>
	z.object({ tableId: TableId, ...shape });

/**
 * Follows a table's chat: answers its last messages, oldest first, and `message` follows for each
 * new one. A private table's chat needs access to the table (`chat.access-denied`).
 */
export const JoinChatEvent = defineEvent(
	"join",
	tablePayload({}),
	z.object({ messages: z.array(ChatMessage).readonly() }),
);

export const LeaveChatEvent = defineEvent(
	"leave",
	tablePayload({}),
	z.object({}),
);

/**
 * Says something at a table whose chat the socket follows (`chat.not-joined` otherwise), as a
 * verified player (`auth.email-not-verified`). The text is trimmed; empty or longer than
 * `CHAT_MESSAGE_LENGTH.max` is `chat.invalid-length`. Answers the message as everyone gets it.
 */
export const SendChatEvent = defineEvent(
	"send",
	tablePayload({ text: z.string().max(1_000) }),
	ChatMessage,
);

/** A new message at a table whose chat the socket follows. */
export const ChatMessageEvent = defineEvent("message", ChatMessage);

/** `/chat`: each table's chat, for its players and spectators, on any instance. */
export const chatNamespace = defineNamespace(NAMESPACES.chat, {
	clientToServer: [JoinChatEvent, LeaveChatEvent, SendChatEvent],
	serverToClient: [ChatMessageEvent],
});

export type ChatClientToServerEvents = ClientToServerEvents<
	typeof chatNamespace
>;
export type ChatServerToClientEvents = ServerToClientEvents<
	typeof chatNamespace
>;
