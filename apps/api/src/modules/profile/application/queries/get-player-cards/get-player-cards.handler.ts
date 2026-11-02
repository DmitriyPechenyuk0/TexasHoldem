import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { inArray } from "drizzle-orm";
import { ObjectStorage } from "@/shared/application/object-storage.js";
import {
	GetPlayerCardsQuery,
	type PlayerCard,
} from "@/shared/application/player-directory.js";
import {
	type Database,
	InjectDatabase,
} from "@/shared/infrastructure/database/index.js";
import { profiles } from "../../../infrastructure/persistence/schema.js";
import { cardColumns, toPlayerCard } from "../player-cards.js";

@QueryHandler(GetPlayerCardsQuery)
export class GetPlayerCardsHandler implements IQueryHandler<GetPlayerCardsQuery> {
	constructor(
		@InjectDatabase() private readonly db: Database,
		private readonly storage: ObjectStorage,
	) {}

	async execute({
		userIds,
	}: GetPlayerCardsQuery): Promise<readonly PlayerCard[]> {
		if (userIds.length === 0) {
			return [];
		}
		const rows = await this.db
			.select(cardColumns)
			.from(profiles)
			.where(inArray(profiles.userId, [...userIds]));
		return rows.map(toPlayerCard(this.storage));
	}
}
