import { z } from "zod";
import type { HttpClient } from "@/shared/api";

const ResendResponse = z.object({ status: z.boolean() });

/**
 * Asks the api to email the verification link again. It answers the same whether or not the
 * address has an unverified account, and sends at most one email a minute to an address.
 */
export async function resendVerificationEmail(
	client: HttpClient,
	email: string,
	callbackURL: string,
): Promise<void> {
	await client.request("/auth/send-verification-email", {
		method: "POST",
		body: { email, callbackURL },
		schema: ResendResponse,
	});
}
