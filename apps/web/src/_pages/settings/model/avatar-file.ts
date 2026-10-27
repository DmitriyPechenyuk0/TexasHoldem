import {
	AVATAR_CONTENT_TYPES,
	AVATAR_MAX_BYTES,
	type AvatarContentType,
} from "@holdem/shared/contracts/profile";

export type AvatarFileError = "type" | "size";

export const isAvatarType = (type: string): type is AvatarContentType =>
	(AVATAR_CONTENT_TYPES as readonly string[]).includes(type);

/**
 * What is wrong with a picked file before it is sent, by what the browser says about it; the
 * api checks the file itself after the upload.
 */
export function avatarFileError(file: {
	readonly type: string;
	readonly size: number;
}): AvatarFileError | null {
	if (!isAvatarType(file.type)) {
		return "type";
	}
	return file.size > AVATAR_MAX_BYTES ? "size" : null;
}

/** For the file picker. */
export const AVATAR_ACCEPT = AVATAR_CONTENT_TYPES.join(",");
