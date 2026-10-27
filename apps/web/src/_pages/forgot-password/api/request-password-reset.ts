import { z } from "zod";
import type { HttpClient } from "@/shared/api";

const RequestPasswordResetResponse = z.object({ status: z.boolean() });

/**
 * Asks the api to email a reset link that leads to `redirectTo`. It answers the same whether or
 * not the address has an account.
 */
export async function requestPasswordReset(
	client: HttpClient,
	email: string,
	redirectTo: string,
): Promise<void> {
	await client.request("/auth/request-password-reset", {
		method: "POST",
		body: { email, redirectTo },
		schema: RequestPasswordResetResponse,
	});
}
