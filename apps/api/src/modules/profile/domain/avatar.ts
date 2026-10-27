import { DomainError } from "@/shared/domain/domain-error.js";

/** The largest upload; `AVATAR_MAX_BYTES` in the shared contract says the same. */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

/** What may be uploaded; `AVATAR_CONTENT_TYPES` in the shared contract says the same. */
export const AVATAR_CONTENT_TYPES = [
	"image/png",
	"image/jpeg",
	"image/webp",
] as const;
export type AvatarContentType = (typeof AVATAR_CONTENT_TYPES)[number];

const startsWith = (bytes: Uint8Array, signature: readonly number[], at = 0) =>
	signature.every((byte, index) => bytes[at + index] === byte);

const ascii = (text: string) => Array.from(text, (char) => char.charCodeAt(0));

/**
 * The image type an upload's first bytes declare, whatever the upload claimed to be; null for
 * anything else, a script or an HTML page posing as an image included.
 */
export function sniffImageType(bytes: Uint8Array): AvatarContentType | null {
	if (startsWith(bytes, [0x89, ...ascii("PNG\r\n\x1a\n")])) {
		return "image/png";
	}
	if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
		return "image/jpeg";
	}
	if (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8)) {
		return "image/webp";
	}
	return null;
}

/**
 * Where a player's uploads wait for confirmation: private, and expired by the bucket after a
 * day if never confirmed.
 */
export const uploadKey = (userId: string, id: string): string =>
	`uploads/${userId}/${id}`;

/** Where a confirmed avatar lives: public, and never rewritten, so it can be cached for good. */
export const avatarKey = (userId: string, id: string): string =>
	`avatars/${userId}/${id}.webp`;

const UPLOAD_ID =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Whether `key` is an upload of this player, so no one can confirm another's object. */
export const isUploadOf = (userId: string, key: string): boolean => {
	const prefix = `uploads/${userId}/`;
	return key.startsWith(prefix) && UPLOAD_ID.test(key.slice(prefix.length));
};

export class AvatarUploadNotFoundError extends DomainError {
	readonly kind = "not-found";
	readonly code = "profile.avatar-upload-not-found";

	constructor() {
		super("No such upload: it expired, was used, or never finished");
	}
}

export class AvatarTooLargeError extends DomainError {
	readonly kind = "rule-violation";
	readonly code = "profile.avatar-too-large";

	constructor() {
		super(`An avatar has at most ${AVATAR_MAX_BYTES} bytes`, {
			params: { maxBytes: AVATAR_MAX_BYTES },
		});
	}
}

export class InvalidAvatarError extends DomainError {
	readonly kind = "rule-violation";
	readonly code = "profile.avatar-invalid-image";

	constructor() {
		super("The upload is not a PNG, JPEG or WebP image");
	}
}
