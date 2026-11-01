import { MESSAGE_MAX_LENGTH, messageText } from "./chat-message.js";

describe("messageText", () => {
	it("trims the text, and counts characters rather than code units", () => {
		expect(messageText("  nice hand \n")).toEqual({
			ok: true,
			value: "nice hand",
		});
		expect(messageText("🂡".repeat(MESSAGE_MAX_LENGTH)).ok).toBe(true);
	});

	it("refuses an empty or overlong message", () => {
		for (const text of ["", "   ", "x".repeat(MESSAGE_MAX_LENGTH + 1)]) {
			const result = messageText(text);
			expect(!result.ok && result.error.code).toBe("chat.invalid-length");
		}
	});
});
