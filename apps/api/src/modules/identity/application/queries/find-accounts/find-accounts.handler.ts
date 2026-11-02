import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import {
	type AccountSummary,
	FindAccountsQuery,
} from "@/shared/application/accounts.js";
import { UserRepository } from "../../user.repository.js";

/** At most this many accounts answer one search. */
export const FIND_ACCOUNTS_LIMIT = 20;

/** Answers the admin context's lookups (shared kernel). */
@QueryHandler(FindAccountsQuery)
export class FindAccountsHandler implements IQueryHandler<FindAccountsQuery> {
	constructor(private readonly users: UserRepository) {}

	execute({ search }: FindAccountsQuery): Promise<readonly AccountSummary[]> {
		return this.users.find(search, FIND_ACCOUNTS_LIMIT);
	}
}
