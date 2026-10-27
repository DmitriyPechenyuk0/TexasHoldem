import { z } from "zod";
import { NewPassword } from "./credentials.js";

/**
 * `POST /api/auth/change-password`, signed in, for an account with a password. Every other session
 * ends; this browser gets a new one. Wrong current password: 400 `auth.invalid-password`; an
 * account that only signs in with providers: 400 `auth.credential-account-not-found`.
 */
export const ChangePasswordRequest = z
	.object({
		currentPassword: z.string().min(1).max(128),
		newPassword: NewPassword,
	})
	// Whoever knew the old password, or holds a stolen session, is out.
	.transform((body) => ({ ...body, revokeOtherSessions: true as const }));
export type ChangePasswordRequest = z.input<typeof ChangePasswordRequest>;
