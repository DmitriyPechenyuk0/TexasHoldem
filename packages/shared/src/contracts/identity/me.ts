import { z } from "zod";
import { UserId } from "../common/ids.js";
import { Locale } from "../common/locale.js";

/** `GET /api/me`: the signed-in user's account. 401 without a session. */
export const MeResponse = z.object({
	id: UserId,
	username: z.string(),
	email: z.string(),
	emailVerified: z.boolean(),
	locale: Locale,
});
export type MeResponse = z.infer<typeof MeResponse>;
