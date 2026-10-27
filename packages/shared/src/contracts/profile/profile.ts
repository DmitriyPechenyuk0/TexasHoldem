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
	/** Null until the player uploads one; clients then draw one from the username. */
	avatarUrl: z.url().nullable(),
	locale: Locale,
	createdAt: z.iso.datetime(),
});
export type MyProfileResponse = z.infer<typeof MyProfileResponse>;

/** `GET /api/profiles/:username`: what anyone may see of a player. */
export const PublicProfileResponse = z.object({
	username: z.string(),
	nickname: z.string(),
	avatarUrl: z.url().nullable(),
	createdAt: z.iso.datetime(),
});
export type PublicProfileResponse = z.infer<typeof PublicProfileResponse>;

/** The largest avatar upload, in bytes. */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

export const AVATAR_CONTENT_TYPES = [
	"image/png",
	"image/jpeg",
	"image/webp",
] as const;
export const AvatarContentType = z.enum(AVATAR_CONTENT_TYPES);
export type AvatarContentType = z.infer<typeof AvatarContentType>;

/**
 * `POST /api/profile/avatar/upload`: a presigned upload for one picture of that type. The browser
 * posts `fields`, then the file as `file`, as multipart form data to `url`; storage refuses
 * another type, or more than `maxBytes`. Then `PUT /api/profile/avatar` with the `key`.
 */
export const RequestAvatarUploadRequest = z.object({
	contentType: AvatarContentType,
});
export type RequestAvatarUploadRequest = z.infer<
	typeof RequestAvatarUploadRequest
>;

export const AvatarUploadResponse = z.object({
	url: z.url(),
	fields: z.record(z.string(), z.string()),
	key: z.string(),
	maxBytes: z.number().int().positive(),
});
export type AvatarUploadResponse = z.infer<typeof AvatarUploadResponse>;

/**
 * `PUT /api/profile/avatar`: makes the upload the avatar and answers the profile. The api checks
 * the file itself, not what the browser said about it: 422 `profile.avatar-invalid-image` or
 * `profile.avatar-too-large`, 404 `profile.avatar-upload-not-found`. `DELETE` removes the avatar.
 */
export const ConfirmAvatarUploadRequest = z.object({
	key: z.string().min(1).max(256),
});
export type ConfirmAvatarUploadRequest = z.infer<
	typeof ConfirmAvatarUploadRequest
>;
