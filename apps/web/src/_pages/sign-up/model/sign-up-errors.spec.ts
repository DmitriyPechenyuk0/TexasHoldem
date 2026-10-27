import { hasErrors, signUpErrors } from "./sign-up-errors";

const valid = {
	username: "Ada_1815",
	email: "ada@example.test",
	password: "correct horse battery",
};

describe("signUpErrors", () => {
	it("finds nothing wrong with a valid form", () => {
		const errors = signUpErrors(valid);

		expect(hasErrors(errors)).toBe(false);
	});

	it.each([
		[{ username: "ab" }, { username: "tooShort" }],
		[{ username: "ada lovelace" }, { username: "invalid" }],
		[{ email: "ada@" }, { email: "invalid" }],
		[{ password: "short" }, { password: "tooShort" }],
		[{ password: "x".repeat(129) }, { password: "tooLong" }],
	])("reports %o as %o", (change, expected) => {
		const errors = signUpErrors({ ...valid, ...change });

		expect(errors).toMatchObject(expected);
		expect(hasErrors(errors)).toBe(true);
	});
});
