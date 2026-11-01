import { z } from "zod";
import { TableId, UserId } from "../contracts/common/ids.js";
import { PlayerCard } from "../contracts/social/social.js";
import {
	type ClientToServerEvents,
	defineEvent,
	defineNamespace,
	NAMESPACES,
	type ServerToClientEvents,
} from "./define.js";

/**
 * Where a friend is, as the one watching may see it. `playing` is a table the watcher may not
 * join (a private one they have no access to), so its id stays hidden.
 */
export const Presence = z.discriminatedUnion("status", [
	z.object({ status: z.literal("offline") }),
	z.object({ status: z.literal("online") }),
	z.object({ status: z.literal("playing") }),
	z.object({ status: z.literal("at-table"), tableId: TableId }),
]);
export type Presence = z.infer<typeof Presence>;

export const FriendPresence = z.object({ userId: UserId, presence: Presence });
export type FriendPresence = z.infer<typeof FriendPresence>;

/**
 * Answers where every friend is; `presence-changed` follows for each change. Changes go to the
 * socket from its connection on, so a snapshot asked for later is never older than them.
 */
export const FriendsPresenceEvent = defineEvent(
	"friends-presence",
	z.object({}),
	z.array(FriendPresence).readonly(),
);

/**
 * A friend came online, went offline (a few seconds after their last tab closed, so a reload
 * shows nothing), sat at a table or left it. Also sent for a new friend.
 */
export const PresenceChangedEvent = defineEvent(
	"presence-changed",
	FriendPresence,
);

/** Someone asked the player to be friends. */
export const FriendRequestReceivedEvent = defineEvent(
	"friend-request-received",
	z.object({ from: PlayerCard }),
);

/** A request was accepted, either way: the two are friends now. */
export const FriendAddedEvent = defineEvent(
	"friend-added",
	z.object({ friend: PlayerCard }),
);

/**
 * `/social`: a signed-in player is online while any of their sockets is connected here, on any
 * instance. It brings their friends' presence and friend requests as they happen.
 */
export const socialNamespace = defineNamespace(NAMESPACES.social, {
	clientToServer: [FriendsPresenceEvent],
	serverToClient: [
		PresenceChangedEvent,
		FriendRequestReceivedEvent,
		FriendAddedEvent,
	],
});

export type SocialClientToServerEvents = ClientToServerEvents<
	typeof socialNamespace
>;
export type SocialServerToClientEvents = ServerToClientEvents<
	typeof socialNamespace
>;
