import { verifyEmailState } from "./verify-email-state";

const verified = { emailVerified: true };
const unverified = { emailVerified: false };

describe("verifyEmailState", () => {
	it.each([
		[undefined, verified, "verified"],
		["TOKEN_EXPIRED", verified, "verified"],
		["TOKEN_EXPIRED", null, "expired"],
		["TOKEN_EXPIRED", unverified, "expired"],
		["INVALID_TOKEN", null, "invalid"],
		["USER_NOT_FOUND", null, "invalid"],
		[["TOKEN_EXPIRED", "x"], null, "invalid"],
		[undefined, null, "pending"],
		[undefined, unverified, "pending"],
	] as const)("error %j with viewer %j shows %s", (error, viewer, state) => {
		expect(verifyEmailState(error, viewer)).toBe(state);
	});
});
