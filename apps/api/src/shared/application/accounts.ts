import { Command, Query } from "@nestjs/cqrs";
import type { Role } from "@holdem/shared/contracts/identity";

/** An account as an admin sees it: who it is and how it signs in, not its secrets. */
export interface AccountSummary {
	readonly userId: string;
	readonly username: string | null;
	readonly email: string;
	readonly emailVerified: boolean;
	readonly role: Role;
	readonly createdAt: Date;
}

// Accounts as admins look them up and act on them (POK-114), answered by identity. In the shared
// kernel, so the admin context asks without knowing who answers.

/**
 * Accounts whose email is `search`, or whose username starts with it, in any case: at most 20,
 * by username.
 */
export class FindAccountsQuery extends Query<readonly AccountSummary[]> {
	constructor(readonly search: string) {
		super();
	}
}

/**
 * Signs the account out everywhere: every session ends, and its sockets are disconnected at their
 * next command or within a minute. Answers how many sessions ended.
 */
export class RevokeSessionsCommand extends Command<number> {
	constructor(readonly userId: string) {
		super();
	}
}
