"use client";

import { Avatar, type AvatarSize } from "@/shared/ui";
import { Identicon } from "./identicon";

export interface UserAvatarProps {
	readonly username: string;
	/** The image's alt text. */
	readonly nickname: string;
	readonly avatarUrl: string | null;
	readonly size?: AvatarSize;
	readonly className?: string;
}

/**
 * A player's picture, or the pattern drawn from their username when they have none: at the table,
 * in friends, in chat, wherever a player shows up.
 */
export function UserAvatar({
	username,
	nickname,
	avatarUrl,
	size,
	className,
}: UserAvatarProps) {
	return (
		<Avatar
			name={nickname}
			src={avatarUrl}
			size={size}
			className={className}
			fallback={<Identicon seed={username} />}
		/>
	);
}
