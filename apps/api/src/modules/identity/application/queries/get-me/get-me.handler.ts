import { Locale, UserId } from "@holdem/shared";
import type { MeResponse } from "@holdem/shared/contracts/identity";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { eq } from "drizzle-orm";
import {
	type Database,
	InjectDatabase,
} from "@/shared/infrastructure/database/index.js";
import { UserNotFoundError } from "../../../domain/user-not-found.error.js";
import { users } from "../../../infrastructure/persistence/schema.js";
import { GetMeQuery } from "./get-me.query.js";

@QueryHandler(GetMeQuery)
export class GetMeHandler implements IQueryHandler<GetMeQuery> {
	constructor(@InjectDatabase() private readonly db: Database) {}

	async execute({ userId }: GetMeQuery): Promise<MeResponse> {
		const [user] = await this.db
			.select({
				id: users.id,
				username: users.username,
				email: users.email,
				emailVerified: users.emailVerified,
				locale: users.locale,
			})
			.from(users)
			.where(eq(users.id, userId));
		if (!user) {
			throw new UserNotFoundError();
		}
		return {
			...user,
			id: UserId.parse(user.id),
			// A locale the app no longer supports reads as the default.
			locale: Locale.catch("en").parse(user.locale),
		};
	}
}
