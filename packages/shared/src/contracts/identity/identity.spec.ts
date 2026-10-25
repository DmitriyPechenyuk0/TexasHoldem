import { API_PREFIX } from "../common/index.js";
import {
	MeResponse,
	RequestPasswordResetRequest,
	ResetPasswordRequest,
	SendVerificationEmailRequest,
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

	it("SendVerificationEmailRequest needs a valid email and drops other keys", () => {
		expect(
			SendVerificationEmailRequest.parse({
				email: signUp.email,
				callbackURL: "/welcome",
				username: "alice_01",
			}),
		).toEqual({ email: signUp.email, callbackURL: "/welcome" });
		expect(
			SendVerificationEmailRequest.safeParse({ email: "alice" }).success,
		).toBe(false);
	});

	it("RequestPasswordResetRequest needs the page the link leads to", () => {
		expect(
			RequestPasswordResetRequest.safeParse({ email: signUp.email }).success,
		).toBe(false);
		expect(
			RequestPasswordResetRequest.parse({
				email: signUp.email,
				redirectTo: "/en/reset-password",
			}),
		).toEqual({ email: signUp.email, redirectTo: "/en/reset-password" });
	});

	it("ResetPasswordRequest holds the new password to the sign-up rules", () => {
		expect(
			ResetPasswordRequest.safeParse({ token: "t", newPassword: "short" })
				.success,
		).toBe(false);
		expect(
			ResetPasswordRequest.parse({
				token: "t",
				newPassword: signUp.password,
				revokeOtherSessions: false,
			}),
		).toEqual({ token: "t", newPassword: signUp.password });
	});
});
