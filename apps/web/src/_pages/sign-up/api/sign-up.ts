import type { SignUpRequest } from "@holdem/shared/contracts/identity";
import { z } from "zod";
import type { HttpClient } from "@/shared/api";

const SignUpResponse = z.object({ user: z.object({ id: z.string() }) });

/**
 * Creates the account and emails its verification link; no session until it is opened. A taken
 * email answers the same as a new one, so the page cannot tell, and neither can anyone else.
 */
export async function signUp(
	client: HttpClient,
	body: SignUpRequest,
): Promise<void> {
	await client.request("/auth/sign-up/email", {
		method: "POST",
		body,
		schema: SignUpResponse,
	});
}
