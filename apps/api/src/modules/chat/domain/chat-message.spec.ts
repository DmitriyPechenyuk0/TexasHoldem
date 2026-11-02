import type { ChatMessage } from "./chat-message.js";
import {
	MESSAGE_MAX_LENGTH,
	messageText,
	REPEAT_WINDOW_MS,
	repeatsLast,
} from "./chat-message.js";

const textOf = (input: string) => {
	const result = messageText(input);
	return result.ok ? result.value : result.error.code;
};

describe("messageText", () => {
	it("trims the text, and counts characters rather than code units", () => {
		expect(textOf("  nice hand \n")).toBe("nice hand");
		expect(textOf("🂡".repeat(MESSAGE_MAX_LENGTH))).toBe(
			"🂡".repeat(MESSAGE_MAX_LENGTH),
		);
	});

	it("drops invisible characters and collapses spaces, but keeps emoji sequences", () => {
		expect(textOf("gl\u0000 ‮hf​")).toBe("gl hf");
		expect(textOf("one\n\n\ttwo   three")).toBe("one two three");
		expect(textOf("a \u200B b")).toBe("a b");
		expect(textOf("👨‍👩‍👧")).toBe("👨‍👩‍👧");
	});

	it("masks profanity instead of refusing the message", () => {
		expect(textOf("ну ты и сука, gg")).toBe("ну ты и ****, gg");
		expect(textOf("what the fuck")).toBe("what the ****");
	});

	it("refuses an empty or overlong message", () => {
		for (const text of ["", "   ", "​​", "x".repeat(MESSAGE_MAX_LENGTH + 1)]) {
			expect(textOf(text)).toBe("chat.invalid-length");
		}
	});
});

describe("repeatsLast", () => {
	const now = new Date("2026-11-02T10:00:00Z");
	const said = (userId: string, text: string, ago: number): ChatMessage => ({
		kind: "player",
		id: `${userId}-${text}`,
		tableId: "t-1",
		userId,
		nickname: userId,
		text,
		at: new Date(now.getTime() - ago).toISOString(),
	});

	it("catches the player's last message again, in any case, within the window", () => {
		const recent = [said("u-1", "gg", 5_000), said("u-2", "wp", 1_000)];

		expect(repeatsLast("GG", "u-1", recent, now)).toBe(true);
		expect(repeatsLast("gg", "u-2", recent, now)).toBe(false);
		expect(repeatsLast("gg", "u-3", recent, now)).toBe(false);
	});

	it("lets a message come again once the window passed, or after another", () => {
		expect(
			repeatsLast("gg", "u-1", [said("u-1", "gg", REPEAT_WINDOW_MS)], now),
		).toBe(false);
		expect(
			repeatsLast(
				"gg",
				"u-1",
				[said("u-1", "gg", 3_000), said("u-1", "nh", 2_000)],
				now,
			),
		).toBe(false);
	});
});
