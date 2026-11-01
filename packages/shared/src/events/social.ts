import { z } from "zod";
import { UserId } from "../contracts/common/ids.js";

/** `social.friend-request-sent` v1: a player asked another to be friends. */
export const FriendRequestSentV1 = z.object({ fromId: UserId, toId: UserId });
export type FriendRequestSentV1 = z.infer<typeof FriendRequestSentV1>;

/**
 * `social.friendship-created` v1: two players are friends now, `requesterId` having asked and
 * `accepterId` having accepted (or asked back).
 */
export const FriendshipCreatedV1 = z.object({
	requesterId: UserId,
	accepterId: UserId,
});
export type FriendshipCreatedV1 = z.infer<typeof FriendshipCreatedV1>;
