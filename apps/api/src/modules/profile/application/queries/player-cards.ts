import type { ObjectStorage } from "@/shared/application/object-storage.js";
import type { PlayerCard } from "@/shared/application/player-directory.js";
import { profiles } from "../../infrastructure/persistence/schema.js";

/** The columns a player's card is made of. */
export const cardColumns = {
	userId: profiles.userId,
	username: profiles.username,
	nickname: profiles.nickname,
	avatarKey: profiles.avatarKey,
};

export const toPlayerCard =
	(storage: ObjectStorage) =>
	({
		avatarKey,
		...card
	}: {
		userId: string;
		username: string;
		nickname: string;
		avatarKey: string | null;
	}): PlayerCard => ({
		...card,
		avatarUrl: avatarKey ? storage.publicUrl(avatarKey) : null,
	});
