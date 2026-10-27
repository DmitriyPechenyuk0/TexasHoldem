import { z } from "zod";
import { Email } from "./credentials.js";

const password = z.string().min(1).max(128);

/** `POST /api/auth/sign-in/email`. */
export const SignInEmailRequest = z.object({
	email: Email,
	password,
	/** false: the session ends with the browser. Default: true. */
	rememberMe: z.boolean().optional(),
	callbackURL: z.string().max(2048).optional(),
});
export type SignInEmailRequest = z.infer<typeof SignInEmailRequest>;

/** `POST /api/auth/sign-in/username`: the username in any case. */
export const SignInUsernameRequest = z.object({
	username: z.string().min(1).max(64),
	password,
	rememberMe: z.boolean().optional(),
	callbackURL: z.string().max(2048).optional(),
});
export type SignInUsernameRequest = z.infer<typeof SignInUsernameRequest>;
