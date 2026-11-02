import { DomainError } from "@/shared/domain/domain-error.js";

export class SelfRequestError extends DomainError {
	readonly kind = "rule-violation";
	readonly code = "social.self-request";

	constructor() {
		super("A player cannot befriend themselves");
	}
}

export class PlayerNotFoundError extends DomainError {
	readonly kind = "not-found";
	readonly code = "social.player-not-found";

	constructor() {
		super("No such player");
	}
}

export class AlreadyFriendsError extends DomainError {
	readonly kind = "conflict";
	readonly code = "social.already-friends";

	constructor() {
		super("Already friends");
	}
}

/** The player asked already, and the other has not answered yet. */
export class RequestPendingError extends DomainError {
	readonly kind = "conflict";
	readonly code = "social.request-pending";

	constructor() {
		super("The request waits for an answer");
	}
}

/** No such request waits for an answer: it never did, or was answered or cancelled. */
export class RequestNotFoundError extends DomainError {
	readonly kind = "not-found";
	readonly code = "social.request-not-found";

	constructor() {
		super("No such friend request");
	}
}

export class NotFriendsError extends DomainError {
	readonly kind = "not-found";
	readonly code = "social.not-friends";

	constructor() {
		super("Not friends");
	}
}

/** The player has as many friends as anyone may. */
export class TooManyFriendsError extends DomainError {
	readonly kind = "conflict";
	readonly code = "social.too-many-friends";

	constructor(max: number) {
		super(`At most ${max} friends`, { params: { max } });
	}
}

/** The other player has as many friends as anyone may. */
export class FriendListFullError extends DomainError {
	readonly kind = "conflict";
	readonly code = "social.friend-list-full";

	constructor(max: number) {
		super(`Their list already has ${max} friends`, { params: { max } });
	}
}

/** The player asked as many players as may wait for an answer at once. */
export class TooManyRequestsError extends DomainError {
	readonly kind = "conflict";
	readonly code = "social.too-many-requests";

	constructor(max: number) {
		super(`At most ${max} requests wait for an answer`, { params: { max } });
	}
}

/** The table is closed, unknown, or one the player may not join, so they cannot invite to it. */
export class TableNotFoundError extends DomainError {
	readonly kind = "not-found";
	readonly code = "social.table-not-found";

	constructor() {
		super("No such table to invite to");
	}
}

/** No such invite waits for an answer: it never did, ran out, or was answered. */
export class TableInviteNotFoundError extends DomainError {
	readonly kind = "not-found";
	readonly code = "social.invite-not-found";

	constructor() {
		super("No such table invite");
	}
}
