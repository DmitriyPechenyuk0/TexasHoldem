import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { and, asc, like, ne } from "drizzle-orm";
import { ObjectStorage } from "@/shared/application/object-storage.js";
import {
	type PlayerCard,
	SearchPlayersQuery,
} from "@/shared/application/player-directory.js";
import {
	type Database,
	InjectDatabase,
} from "@/shared/infrastructure/database/index.js";
import { profiles } from "../../../infrastructure/persistence/schema.js";
import { cardColumns, toPlayerCard } from "../player-cards.js";

/** A LIKE pattern for values starting with `prefix`, whose wildcards match only themselves. */
export const startingWith = (prefix: string): string =>
	`${prefix.replace(/[\\%_]/g, "\\$&")}%`;

/** Usernames are stored lowercase, and indexed for prefix matches (`text_pattern_ops`). */
@QueryHandler(SearchPlayersQuery)
export class SearchPlayersHandler implements IQueryHandler<SearchPlayersQuery> {
	constructor(
		@InjectDatabase() private readonly db: Database,
		private readonly storage: ObjectStorage,
	) {}

	async execute({
		prefix,
		limit,
		excludeUserId,
	}: SearchPlayersQuery): Promise<readonly PlayerCard[]> {
		const rows = await this.db
			.select(cardColumns)
			.from(profiles)
			.where(
				and(
					like(profiles.username, startingWith(prefix.toLowerCase())),
					ne(profiles.userId, excludeUserId),
				),
			)
			.orderBy(asc(profiles.username))
			.limit(limit);
		return rows.map(toPlayerCard(this.storage));
	}
}
