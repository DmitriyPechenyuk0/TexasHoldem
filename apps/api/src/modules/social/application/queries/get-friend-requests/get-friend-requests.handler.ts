import { type IQueryHandler, QueryBus, QueryHandler } from "@nestjs/cqrs";
import { desc, eq } from "drizzle-orm";
import {
	type Database,
	InjectDatabase,
} from "@/shared/infrastructure/database/index.js";
import { friendRequests } from "../../../infrastructure/persistence/schema.js";
import { withCards } from "../with-cards.js";
import {
	GetFriendRequestsQuery,
	type PendingRequest,
} from "./get-friend-requests.query.js";

@QueryHandler(GetFriendRequestsQuery)
export class GetFriendRequestsHandler implements IQueryHandler<GetFriendRequestsQuery> {
	constructor(
		@InjectDatabase() private readonly db: Database,
		private readonly queryBus: QueryBus,
	) {}

	async execute({
		userId,
		direction,
	}: GetFriendRequestsQuery): Promise<readonly PendingRequest[]> {
		const [mine, theirs] =
			direction === "incoming"
				? [friendRequests.toId, friendRequests.fromId]
				: [friendRequests.fromId, friendRequests.toId];
		const rows = await this.db
			.select({ userId: theirs, sentAt: friendRequests.sentAt })
			.from(friendRequests)
			.where(eq(mine, userId))
			.orderBy(desc(friendRequests.sentAt));
		return withCards(this.queryBus, rows);
	}
}
