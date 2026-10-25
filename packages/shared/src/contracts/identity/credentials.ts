import { z } from "zod";

/** Public and unique regardless of case; stored in lowercase. */
export const Username = z
	.string()
	.min(3)
	.max(20)
	.regex(/^[A-Za-z0-9_]+$/, "only letters, digits and underscores");
export type Username = z.infer<typeof Username>;

export const Email = z.email().max(254);
export type Email = z.infer<typeof Email>;

/** The rule for a new password; signing in only bounds the length. */
export const NewPassword = z.string().min(10).max(128);
export type NewPassword = z.infer<typeof NewPassword>;
