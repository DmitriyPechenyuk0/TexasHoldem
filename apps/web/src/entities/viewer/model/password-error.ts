import { NewPassword } from "@holdem/shared/contracts/identity";

export type PasswordError = "tooShort" | "tooLong" | "mismatch";

/** What is wrong with a new password and its confirmation, by the api's rules; null when nothing. */
export function passwordError(
	password: string,
	confirmation: string,
): PasswordError | null {
	const result = NewPassword.safeParse(password);
	if (!result.success) {
		return result.error.issues[0]?.code === "too_big" ? "tooLong" : "tooShort";
	}
	return password === confirmation ? null : "mismatch";
}
