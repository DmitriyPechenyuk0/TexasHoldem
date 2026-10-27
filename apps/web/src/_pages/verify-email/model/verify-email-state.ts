/**
 * What the page that verification links lead to shows. The api has already checked the token
 * and either signed the browser in or added `?error=TOKEN_EXPIRED` / `?error=INVALID_TOKEN`.
 */
export type VerifyEmailState = "verified" | "expired" | "invalid" | "pending";

export function verifyEmailState(
	error: unknown,
	viewer: { readonly emailVerified: boolean } | null,
): VerifyEmailState {
	// Signed in with a verified email: whatever an old link says, there is nothing left to do.
	if (viewer?.emailVerified) {
		return "verified";
	}
	if (error === "TOKEN_EXPIRED") {
		return "expired";
	}
	if (error !== undefined) {
		return "invalid";
	}
	// Opened without a link's answer: right after signing up, or as an unverified OAuth user.
	return "pending";
}
