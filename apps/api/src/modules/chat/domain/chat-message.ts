import { maskProfanity } from "@/shared/domain/profanity.js";
import { err, ok, type Result } from "@/shared/domain/result.js";
import { InvalidMessageLengthError } from "./chat-errors.js";

/** In characters (code points), once trimmed; `CHAT_MESSAGE_LENGTH` in the shared contract says the same. */
export const MESSAGE_MIN_LENGTH = 1;
export const MESSAGE_MAX_LENGTH = 200;

/** What the dealer may announce; the client words each in its language. */
export type DealerKey = "pot-won";

/** A message in a table's chat, as it is kept and sent; `at` is an ISO timestamp. */
export type ChatMessage =
	| {
			readonly kind: "player";
			readonly id: string;
			readonly tableId: string;
			readonly userId: string;
			readonly nickname: string;
			readonly text: string;
			readonly at: string;
	  }
	| {
			readonly kind: "dealer";
			readonly id: string;
			readonly tableId: string;
			readonly key: DealerKey;
			readonly params: Readonly<Record<string, string | number>>;
			readonly at: string;
	  };

/**
 * Control and format characters, which no message needs: they hide text, reverse it, or break
 * lines. The zero-width joiner stays, since emoji sequences are built with it.
 */
const INVISIBLE = /(?!\u200D)[\p{Cc}\p{Cf}]/gu;

/**
 * The text a player's message carries: without invisible characters, each run of spaces
 * collapsed to one, trimmed, within the length, and with profanity masked.
 */
export function messageText(
	input: string,
): Result<string, InvalidMessageLengthError> {
	const text = input
		.replace(/\s+/gu, " ")
		.replace(INVISIBLE, "")
		.replace(/ {2,}/gu, " ")
		.trim();
	const length = Array.from(text).length;
	return length < MESSAGE_MIN_LENGTH || length > MESSAGE_MAX_LENGTH
		? err(new InvalidMessageLengthError(MESSAGE_MIN_LENGTH, MESSAGE_MAX_LENGTH))
		: ok(maskProfanity(text));
}

/** How long a player may not say the same thing again at a table. */
export const REPEAT_WINDOW_MS = 30_000;

/**
 * Whether the player's message repeats their last one at the table, within the window: the same
 * text in any case.
 */
export function repeatsLast(
	text: string,
	userId: string,
	recent: readonly ChatMessage[],
	now: Date,
): boolean {
	const last = recent.findLast(
		(message) => message.kind === "player" && message.userId === userId,
	);
	return (
		last?.kind === "player" &&
		last.text.toLowerCase() === text.toLowerCase() &&
		now.getTime() - Date.parse(last.at) < REPEAT_WINDOW_MS
	);
}
