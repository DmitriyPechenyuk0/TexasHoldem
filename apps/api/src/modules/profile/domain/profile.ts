import type { Result } from "@/shared/domain/result.js";
import {
	type InvalidNicknameError,
	type Nickname,
	parseNickname,
} from "./nickname.js";

/**
 * How a player appears to others, apart from the account itself (identity). Ids and locales come
 * validated from the edges, so the domain takes them as plain strings.
 */
export interface Profile {
	readonly userId: string;
	/** The unique handle from identity, lowercase. Never changes. */
	readonly username: string;
	readonly nickname: Nickname;
	/** Storage key of the uploaded avatar; null until the player uploads one. */
	readonly avatarKey: string | null;
	readonly locale: string;
	readonly createdAt: Date;
}

export interface NewProfile {
	readonly userId: string;
	readonly username: string;
	readonly locale: string;
	readonly now: Date;
}

/** A new account's profile: the nickname starts as the username, which always satisfies its rules. */
export function createProfile({
	userId,
	username,
	locale,
	now,
}: NewProfile): Profile {
	return {
		userId,
		username,
		nickname: username as Nickname,
		avatarKey: null,
		locale,
		createdAt: now,
	};
}

export function renameProfile(
	profile: Profile,
	input: string,
): Result<Profile, InvalidNicknameError> {
	const nickname = parseNickname(input);
	return nickname.ok
		? { ok: true, value: { ...profile, nickname: nickname.value } }
		: nickname;
}

export function changeLocale(profile: Profile, locale: string): Profile {
	return { ...profile, locale };
}
