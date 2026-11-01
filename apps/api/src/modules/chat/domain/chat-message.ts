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

/** The text a player's message carries: trimmed, and within the length. */
export function messageText(
	input: string,
): Result<string, InvalidMessageLengthError> {
	const text = input.trim();
	const length = Array.from(text).length;
	return length < MESSAGE_MIN_LENGTH || length > MESSAGE_MAX_LENGTH
		? err(new InvalidMessageLengthError(MESSAGE_MIN_LENGTH, MESSAGE_MAX_LENGTH))
		: ok(text);
}
