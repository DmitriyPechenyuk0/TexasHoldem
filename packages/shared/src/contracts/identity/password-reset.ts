import { z } from "zod";
import { Email, NewPassword } from "./credentials.js";

/**
 * `POST /api/auth/request-password-reset`: emails a link that works once, for an hour. The answer
 * is the same, and takes as long, whether or not the address has an account.
 */
export const RequestPasswordResetRequest = z.object({
	email: Email,
	/**
	 * The web page that asks for the new password; must be on the web origin. The emailed link
	 * leads there with `?token=…`, or with `?error=INVALID_TOKEN` once expired or used.
	 */
	redirectTo: z.string().max(2048),
});
export type RequestPasswordResetRequest = z.infer<
	typeof RequestPasswordResetRequest
>;

/** `POST /api/auth/reset-password`: signs every session of the account out. */
export const ResetPasswordRequest = z.object({
	token: z.string().min(1).max(256),
	newPassword: NewPassword,
});
export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequest>;
