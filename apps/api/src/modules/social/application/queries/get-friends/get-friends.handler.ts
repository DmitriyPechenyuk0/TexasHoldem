import { type IQueryHandler, QueryBus, QueryHandler } from "@nestjs/cqrs";
import { eq } from "drizzle-orm";
import {
	type Database,
	InjectDatabase,
} from "@/shared/infrastructure/database/index.js";
import { friendships } from "../../../infrastructure/persistence/schema.js";
import { withCards } from "../with-cards.js";
import { type Friend, GetFriendsQuery } from "./get-friends.query.js";

@QueryHandler(GetFriendsQuery)
export class GetFriendsHandler implements IQueryHandler<GetFriendsQuery> {
	constructor(
		@InjectDatabase() private readonly db: Database,
		private readonly queryBus: QueryBus,
	) {}

	async execute({ userId }: GetFriendsQuery): Promise<readonly Friend[]> {
		const rows = await this.db
			.select({ userId: friendships.friendId, since: friendships.since })
			.from(friendships)
			.where(eq(friendships.userId, userId));
		const friends = await withCards(this.queryBus, rows);
		return friends.sort(
			(a, b) =>
				a.nickname.localeCompare(b.nickname) ||
				a.username.localeCompare(b.username),
		);
	}
}
