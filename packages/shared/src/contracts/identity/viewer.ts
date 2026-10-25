import type { UserId } from "../common/ids.js";

/**
 * The signed-in user behind a request or a socket, as the api resolves them from the session
 * cookie. Server-side only: clients read their account from `GET /api/me`.
 */
export interface Viewer {
	readonly userId: UserId;
	readonly username: string;
	readonly emailVerified: boolean;
}
