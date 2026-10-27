import { Email, NewPassword } from "@holdem/shared/contracts/identity";
import { type UsernameError, usernameError } from "@/entities/viewer";

export interface SignUpErrors {
	readonly username?: UsernameError | "taken";
	readonly email?: "invalid";
	readonly password?: "tooShort" | "tooLong";
}

export interface SignUpFields {
	readonly username: string;
	readonly email: string;
	readonly password: string;
}

/** What is wrong with each field by the api's rules; empty when the form can go. */
export function signUpErrors({
	username,
	email,
	password,
}: SignUpFields): SignUpErrors {
	const passwordResult = NewPassword.safeParse(password);
	return {
		username: usernameError(username) ?? undefined,
		email: Email.safeParse(email).success ? undefined : "invalid",
		password: passwordResult.success
			? undefined
			: passwordResult.error.issues[0]?.code === "too_big"
				? "tooLong"
				: "tooShort",
	};
}

export const hasErrors = (errors: SignUpErrors): boolean =>
	Object.values(errors).some((error) => error !== undefined);
