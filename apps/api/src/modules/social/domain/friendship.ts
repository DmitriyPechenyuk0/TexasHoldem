import { err, ok, type Result } from "@/shared/domain/result.js";
import {
	AlreadyFriendsError,
	FriendListFullError,
	NotFriendsError,
	RequestNotFoundError,
	RequestPendingError,
	SelfRequestError,
	TooManyFriendsError,
	TooManyRequestsError,
} from "./social-errors.js";

/** How many friends a player may have (shared contract `FRIEND_LIMITS`). */
export const MAX_FRIENDS = 200;
/** How many of a player's requests may wait for an answer at once (`FRIEND_LIMITS` too). */
export const MAX_PENDING_REQUESTS = 20;

/**
 * Where two players stand, seen from `me`: friends, or a request waiting either way (never both:
 * a request back befriends them). Counts are each player's, as they are now.
 */
export interface Standing {
	readonly me: string;
	readonly them: string;
	readonly friends: boolean;
	/** `me` asked `them`, who has not answered. */
	readonly requested: boolean;
	/** `them` asked `me`, who has not answered. */
	readonly requestedBack: boolean;
	readonly myFriends: number;
	readonly theirFriends: number;
	/** `me`'s requests waiting for an answer. */
	readonly myPendingRequests: number;
}

/** What a friend request does: it waits for an answer, or answers theirs. */
export type RequestOutcome = "requested" | "befriended";

/** Both can take one more friend: `me` first, as the one who acts. */
function roomForFriendship(standing: Standing): Result<void> {
	if (standing.myFriends >= MAX_FRIENDS) {
		return err(new TooManyFriendsError(MAX_FRIENDS));
	}
	if (standing.theirFriends >= MAX_FRIENDS) {
		return err(new FriendListFullError(MAX_FRIENDS));
	}
	return ok(undefined);
}

/**
 * `me` asks `them` to be friends. When `them` asked already, this accepts their request: asking
 * each other is agreeing.
 */
export function sendFriendRequest(standing: Standing): Result<RequestOutcome> {
	if (standing.me === standing.them) {
		return err(new SelfRequestError());
	}
	if (standing.friends) {
		return err(new AlreadyFriendsError());
	}
	if (standing.requested) {
		return err(new RequestPendingError());
	}
	const room = roomForFriendship(standing);
	if (!room.ok) {
		return room;
	}
	if (standing.requestedBack) {
		return ok("befriended");
	}
	if (standing.myPendingRequests >= MAX_PENDING_REQUESTS) {
		return err(new TooManyRequestsError(MAX_PENDING_REQUESTS));
	}
	return ok("requested");
}

/** `me` accepts the request `them` sent. */
export function acceptFriendRequest(standing: Standing): Result<void> {
	if (!standing.requestedBack) {
		return err(new RequestNotFoundError());
	}
	return roomForFriendship(standing);
}

/** `me` declines the request `them` sent; `them` is not told. */
export function declineFriendRequest(standing: Standing): Result<void> {
	return standing.requestedBack
		? ok(undefined)
		: err(new RequestNotFoundError());
}

/** `me` takes back the request they sent `them`. */
export function cancelFriendRequest(standing: Standing): Result<void> {
	return standing.requested ? ok(undefined) : err(new RequestNotFoundError());
}

/** `me` stops being friends with `them`, for both. */
export function removeFriend(standing: Standing): Result<void> {
	return standing.friends ? ok(undefined) : err(new NotFriendsError());
}
