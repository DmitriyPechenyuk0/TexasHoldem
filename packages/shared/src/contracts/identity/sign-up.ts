import { z } from "zod";
import { Locale } from "../common/locale.js";
import { Email, NewPassword, Username } from "./credentials.js";

/**
 * `POST /api/auth/sign-up/email`. Every other key is dropped before Better Auth sees the body, so a
 * client cannot set `emailVerified`, `image` or anything a plugin adds to the user.
 */
export const SignUpRequest = z.object({
	username: Username,
	email: Email,
	password: NewPassword,
	/** The language of the user's emails. Default: `en`. */
	locale: Locale.optional(),
	/** Where the verification link leads after signing in; must be on the web origin. */
	callbackURL: z.string().max(2048).optional(),
});
export type SignUpRequest = z.infer<typeof SignUpRequest>;
