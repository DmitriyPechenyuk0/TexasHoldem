import { passwordError } from "./password-error";

describe("passwordError", () => {
	it.each([
		["short", "short", "tooShort"],
		["x".repeat(129), "x".repeat(129), "tooLong"],
		["correct horse battery", "correct horse batter", "mismatch"],
		["correct horse battery", "correct horse battery", null],
	])("%j and %j → %s", (password, confirmation, expected) => {
		expect(passwordError(password, confirmation)).toBe(expected);
	});
});
