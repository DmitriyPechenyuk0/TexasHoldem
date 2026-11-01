import { z } from "zod";
import { UserId } from "../common/ids.js";
import { Username } from "../identity/credentials.js";

/** How many friends a player may have, and how many of their requests may wait for an answer. */
export const FRIEND_LIMITS = { friends: 200, pendingRequests: 20 } as const;

/** How another player is shown in lists: the handle, the display name and the avatar. */
export const PlayerCard = z.object({
	userId: UserId,
	username: z.string(),
	nickname: z.string(),
	/** Null until the player uploads one; clients then draw one from the username. */
	avatarUrl: z.url().nullable(),
});
export type PlayerCard = z.infer<typeof PlayerCard>;

/** `GET /api/friends`: the signed-in player's friends, by nickname. */
export const Friend = PlayerCard.extend({ since: z.iso.datetime() });
export type Friend = z.infer<typeof Friend>;
export const FriendsResponse = z.array(Friend).readonly();
export type FriendsResponse = z.infer<typeof FriendsResponse>;

/**
 * `GET /api/friend-requests/incoming` and `/outgoing`: who asked the player, or whom they asked,
 * newest first.
 */
export const FriendRequest = PlayerCard.extend({ sentAt: z.iso.datetime() });
export type FriendRequest = z.infer<typeof FriendRequest>;
export const FriendRequestsResponse = z.array(FriendRequest).readonly();
export type FriendRequestsResponse = z.infer<typeof FriendRequestsResponse>;

/**
 * `POST /api/friend-requests`, by a verified player. Asking oneself is `social.self-request`, an
 * unknown username `social.player-not-found`; a friend `social.already-friends`, and asking again
 * `social.request-pending`. Limits: `social.too-many-friends` (yours), `social.friend-list-full`
 * (theirs), `social.too-many-requests` (waiting for an answer).
 */
export const SendFriendRequestRequest = z.object({ username: Username });
export type SendFriendRequestRequest = z.infer<typeof SendFriendRequestRequest>;

/**
 * `requested`: the request waits for their answer. `befriended`: they had asked you already, so
 * you are friends now.
 */
export const SendFriendRequestResponse = z.object({
	userId: UserId,
	status: z.enum(["requested", "befriended"]),
});
export type SendFriendRequestResponse = z.infer<
	typeof SendFriendRequestResponse
>;

/** `GET /api/players/search?q=`: players whose username starts with `q`, any case. */
export const PlayerSearchQuery = z.object({
	q: z
		.string()
		.min(1)
		.max(20)
		.regex(/^[A-Za-z0-9_]+$/),
});
export type PlayerSearchQuery = z.infer<typeof PlayerSearchQuery>;

/** Where the signed-in player stands with someone: what a list offers to do next. */
export const Relation = z.enum([
	"none",
	"friend",
	/** You asked them. */
	"requested",
	/** They asked you. */
	"requested-you",
]);
export type Relation = z.infer<typeof Relation>;

/** At most 10 players, by username, without the one searching. */
export const PlayerSearchResponse = z
	.array(PlayerCard.extend({ relation: Relation }))
	.readonly();
export type PlayerSearchResponse = z.infer<typeof PlayerSearchResponse>;
