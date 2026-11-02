import { Query } from "@nestjs/cqrs";
import type { AccountSummary } from "@/shared/application/accounts.js";

export interface UserDetails extends AccountSummary {
	readonly nickname: string | null;
	/** The open tables the user sits at. */
	readonly tables: readonly {
		readonly tableId: string;
		readonly name: string;
		readonly seat: number;
	}[];
}

/** Accounts by email or the beginning of a username, with their profile and current tables. */
export class LookUpUsersQuery extends Query<readonly UserDetails[]> {
	constructor(readonly search: string) {
		super();
	}
}
