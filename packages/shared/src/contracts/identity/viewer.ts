import type { UserId } from "../common/ids.js";

/** What an account may do beyond playing: an admin manages tables and accounts (`/api/admin`). */
export type Role = "user" | "admin";

/**
 * The signed-in user behind a request or a socket, as the api resolves them from the session
 * cookie. Server-side only: clients read their account from `GET /api/me`.
 */
export interface Viewer {
	readonly userId: UserId;
	/** Null until an account created by an OAuth sign-in has chosen one. */
	readonly username: string | null;
	readonly emailVerified: boolean;
	/** Set outside the app only (`pnpm --filter api user:role`); never by a request. */
	readonly role: Role;
}
