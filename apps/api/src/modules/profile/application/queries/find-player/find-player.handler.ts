import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { eq } from "drizzle-orm";
import { ObjectStorage } from "@/shared/application/object-storage.js";
import {
	FindPlayerQuery,
	type PlayerCard,
} from "@/shared/application/player-directory.js";
import {
	type Database,
	InjectDatabase,
} from "@/shared/infrastructure/database/index.js";
import { profiles } from "../../../infrastructure/persistence/schema.js";
import { cardColumns, toPlayerCard } from "../player-cards.js";

@QueryHandler(FindPlayerQuery)
export class FindPlayerHandler implements IQueryHandler<FindPlayerQuery> {
	constructor(
		@InjectDatabase() private readonly db: Database,
		private readonly storage: ObjectStorage,
	) {}

	async execute({ username }: FindPlayerQuery): Promise<PlayerCard | null> {
		const [row] = await this.db
			.select(cardColumns)
			.from(profiles)
			.where(eq(profiles.username, username.toLowerCase()));
		return row ? toPlayerCard(this.storage)(row) : null;
	}
}
