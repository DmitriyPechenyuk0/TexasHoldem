import { z } from "zod";
import type { HttpClient } from "@/shared/api";

const SignInResponse = z.object({ user: z.object({ id: z.string() }) });

export interface PasswordSignIn {
	/** An email when it has an `@`, a username in any case otherwise. */
	readonly identifier: string;
	readonly password: string;
	/** Where the verification link leads, should the email still need it: the api sends it again. */
	readonly callbackURL: string;
}

/** Signs in with a password; the session cookie comes with the answer. */
export async function signInWithPassword(
	client: HttpClient,
	{ identifier, password, callbackURL }: PasswordSignIn,
): Promise<void> {
	const byEmail = identifier.includes("@");
	await client.request(
		byEmail ? "/auth/sign-in/email" : "/auth/sign-in/username",
		{
			method: "POST",
			body: byEmail
				? { email: identifier, password, callbackURL }
				: { username: identifier, password, callbackURL },
			schema: SignInResponse,
		},
	);
}
