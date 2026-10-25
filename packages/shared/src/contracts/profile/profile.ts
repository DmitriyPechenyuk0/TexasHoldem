import { z } from "zod";
import { UserId } from "../common/ids.js";
import { Locale } from "../common/locale.js";

/**
 * Length of a nickname, in characters, once trimmed. The api enforces it with stable codes
 * (`profile.nickname-too-short`, `profile.nickname-too-long`, `profile.nickname-invalid-characters`);
 * forms can use it for hints.
 */
export const NICKNAME_LENGTH = { min: 2, max: 24 } as const;

/**
 * `PUT /api/profile/nickname`. Only bounded here: the api trims it and applies the rules, so a
 * client gets a stable code per broken rule rather than a generic `request.invalid`.
 */
export const UpdateNicknameRequest = z.object({
	nickname: z.string().max(256),
});
export type UpdateNicknameRequest = z.infer<typeof UpdateNicknameRequest>;

/** `PUT /api/profile/locale`: the language of the interface and of the user's emails. */
export const UpdateLocaleRequest = z.object({ locale: Locale });
export type UpdateLocaleRequest = z.infer<typeof UpdateLocaleRequest>;

/**
 * `GET /api/profile`, and the answer to its updates: the signed-in user's own profile. The
 * username is the unique handle (identity); the nickname is the display name at the table, not
 * unique.
 */
export const MyProfileResponse = z.object({
	userId: UserId,
	username: z.string(),
	nickname: z.string(),
	locale: Locale,
	createdAt: z.iso.datetime(),
});
export type MyProfileResponse = z.infer<typeof MyProfileResponse>;

/** `GET /api/profiles/:username`: what anyone may see of a player. */
export const PublicProfileResponse = z.object({
	username: z.string(),
	nickname: z.string(),
	createdAt: z.iso.datetime(),
});
export type PublicProfileResponse = z.infer<typeof PublicProfileResponse>;
