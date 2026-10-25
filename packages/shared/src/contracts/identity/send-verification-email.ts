import { z } from "zod";
import { Email } from "./credentials.js";

/**
 * `POST /api/auth/send-verification-email`: sends the link again. The answer is the same whether or
 * not the address has an unverified account, and an address gets at most one email a minute.
 */
export const SendVerificationEmailRequest = z.object({
	email: Email,
	/** Where the link leads after signing in; must be on the web origin. */
	callbackURL: z.string().max(2048).optional(),
});
export type SendVerificationEmailRequest = z.infer<
	typeof SendVerificationEmailRequest
>;
