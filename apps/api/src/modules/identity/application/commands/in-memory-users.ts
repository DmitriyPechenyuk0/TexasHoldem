import type { Locale, UserId } from "@holdem/shared";
import type { AccountSummary } from "@/shared/application/accounts.js";
import {
	type ChooseUsernameOutcome,
	UserRepository,
} from "../user.repository.js";

export interface StoredUser {
	username: string | null;
	locale: string;
	emailVerified: boolean;
}

/** The repository for handler tests: users in a map, by id, with unique usernames. */
export class InMemoryUsers extends UserRepository {
	readonly rows = new Map<UserId, StoredUser>();
	/** Open sessions per user. */
	readonly sessions = new Map<string, number>();

	constructor(users: Readonly<Record<UserId, StoredUser>> = {}) {
		super();
		for (const [userId, user] of Object.entries(users)) {
			this.rows.set(userId as UserId, { ...user });
		}
	}

	async setLocale(userId: UserId, locale: Locale): Promise<void> {
		const user = this.rows.get(userId);
		this.rows.set(userId, { ...user!, locale });
	}

	async chooseUsername(
		userId: UserId,
		username: string,
	): Promise<ChooseUsernameOutcome> {
		const user = this.rows.get(userId);
		if (!user) {
			return { kind: "not-found" };
		}
		if (user.username !== null) {
			return { kind: "already-chosen" };
		}
		if ([...this.rows.values()].some((other) => other.username === username)) {
			return { kind: "taken" };
		}
		user.username = username;
		return {
			kind: "chosen",
			locale: user.locale,
			emailVerified: user.emailVerified,
		};
	}

	async find(
		search: string,
		limit: number,
	): Promise<readonly AccountSummary[]> {
		const term = search.toLowerCase();
		return [...this.rows]
			.filter(([, user]) => user.username?.startsWith(term))
			.slice(0, limit)
			.map(([userId, user]) => ({
				userId,
				username: user.username,
				email: `${user.username}@example.test`,
				emailVerified: user.emailVerified,
				role: "user",
				createdAt: new Date(0),
			}));
	}

	async revokeSessions(userId: string): Promise<number> {
		const open = this.sessions.get(userId) ?? 0;
		this.sessions.delete(userId);
		return open;
	}
}
