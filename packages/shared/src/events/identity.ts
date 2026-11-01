import { z } from "zod";
import { UserId } from "../contracts/common/ids.js";
import { Locale } from "../contracts/common/locale.js";

/** `identity.user-registered` v1: an account was created, with its username; its email may not be verified yet. */
export const UserRegisteredV1 = z.object({
	userId: UserId,
	username: z.string().min(1),
	locale: Locale,
});
export type UserRegisteredV1 = z.infer<typeof UserRegisteredV1>;

/** `identity.user-verified` v1: the account's email is verified; it comes after `user-registered`. */
export const UserVerifiedV1 = z.object({ userId: UserId });
export type UserVerifiedV1 = z.infer<typeof UserVerifiedV1>;
