import { z } from "zod";
import type { HttpClient } from "@/shared/api";

const ResetPasswordResponse = z.object({ status: z.boolean() });

/** Sets the new password with the token from the emailed link; every session of the account ends. */
export async function resetPassword(
	client: HttpClient,
	token: string,
	newPassword: string,
): Promise<void> {
	await client.request("/auth/reset-password", {
		method: "POST",
		body: { token, newPassword },
		schema: ResetPasswordResponse,
	});
}
