import { z } from "zod";
import { UserId } from "../common/ids.js";
import { Locale } from "../common/locale.js";

/** `GET /api/me`: the signed-in user's account. 401 without a session. */
export const MeResponse = z.object({
	id: UserId,
	/**
	 * Null until chosen: an OAuth sign-in creates the account without one when the provider's
	 * handle cannot be used. Such an account can look around but not play (`PUT /api/me/username`).
	 */
	username: z.string().nullable(),
	email: z.string(),
	emailVerified: z.boolean(),
	locale: Locale,
});
export type MeResponse = z.infer<typeof MeResponse>;
