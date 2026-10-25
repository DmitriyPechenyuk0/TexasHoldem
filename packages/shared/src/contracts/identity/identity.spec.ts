import { API_PREFIX } from "../common/index.js";
import {
	MeResponse,
	SignInEmailRequest,
	SignInUsernameRequest,
	SignUpRequest,
	Username,
} from "./index.js";

const signUp = {
	username: "Alice_01",
	email: "alice@example.test",
	password: "correct horse battery",
};

describe("identity contracts", () => {
	it("API_PREFIX is the root of every REST route", () => {
		expect(API_PREFIX).toBe("/api");
	});

	it.each(["abc", "Alice_01", "a".repeat(20)])(
		"accepts the username %s",
		(name) => {
			expect(Username.safeParse(name).success).toBe(true);
		},
	);

	it.each(["ab", "a".repeat(21), "alice!", "алиса", "al ice", "a.b"])(
		"refuses the username %s",
		(name) => {
			expect(Username.safeParse(name).success).toBe(false);
		},
	);

	it("SignUpRequest drops every key it does not know", () => {
		expect(
			SignUpRequest.parse({
				...signUp,
				locale: "ru",
				emailVerified: true,
				image: "javascript:alert(1)",
				name: "admin",
			}),
		).toEqual({ ...signUp, locale: "ru" });
	});

	it("SignUpRequest enforces the password length and a known locale", () => {
		const fields = (input: object) =>
			SignUpRequest.safeParse({ ...signUp, ...input }).error?.issues.map(
				(issue) => issue.path.join("."),
			);

		expect(fields({ password: "short" })).toEqual(["password"]);
		expect(fields({ password: "x".repeat(129) })).toEqual(["password"]);
		expect(fields({ locale: "de" })).toEqual(["locale"]);
		expect(fields({ email: "not-an-email" })).toEqual(["email"]);
	});

	it("sign-in only bounds the password length", () => {
		expect(
			SignInEmailRequest.safeParse({ email: signUp.email, password: "short" })
				.success,
		).toBe(true);
		expect(
			SignInUsernameRequest.safeParse({ username: "ALICE_01", password: "" })
				.success,
		).toBe(false);
	});

	it("MeResponse carries the account with a UUID id", () => {
		const me = {
			id: "0b7c6f1e-58a4-4f6b-9a39-5f0f6a8a1c2d",
			username: "alice_01",
			email: "alice@example.test",
			emailVerified: true,
			locale: "en",
		};
		expect(MeResponse.parse(me)).toEqual(me);
		expect(MeResponse.safeParse({ ...me, id: "42" }).success).toBe(false);
	});
});
