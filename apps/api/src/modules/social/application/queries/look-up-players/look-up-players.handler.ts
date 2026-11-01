import { type IQueryHandler, QueryBus, QueryHandler } from "@nestjs/cqrs";
import { and, eq, inArray, or } from "drizzle-orm";
import { SearchPlayersQuery } from "@/shared/application/player-directory.js";
import {
	type Database,
	InjectDatabase,
} from "@/shared/infrastructure/database/index.js";
import {
	friendRequests,
	friendships,
} from "../../../infrastructure/persistence/schema.js";
import {
	LOOK_UP_LIMIT,
	LookUpPlayersQuery,
	type PlayerMatch,
} from "./look-up-players.query.js";

@QueryHandler(LookUpPlayersQuery)
export class LookUpPlayersHandler implements IQueryHandler<LookUpPlayersQuery> {
	constructor(
		@InjectDatabase() private readonly db: Database,
		private readonly queryBus: QueryBus,
	) {}

	async execute({
		userId,
		prefix,
	}: LookUpPlayersQuery): Promise<readonly PlayerMatch[]> {
		const players = await this.queryBus.execute(
			new SearchPlayersQuery(prefix, LOOK_UP_LIMIT, userId),
		);
		if (players.length === 0) {
			return [];
		}
		const ids = players.map((player) => player.userId);
		const [friends, requests] = await Promise.all([
			this.db
				.select({ id: friendships.friendId })
				.from(friendships)
				.where(
					and(
						eq(friendships.userId, userId),
						inArray(friendships.friendId, ids),
					),
				),
			this.db
				.select({ fromId: friendRequests.fromId, toId: friendRequests.toId })
				.from(friendRequests)
				.where(
					or(
						and(
							eq(friendRequests.fromId, userId),
							inArray(friendRequests.toId, ids),
						),
						and(
							eq(friendRequests.toId, userId),
							inArray(friendRequests.fromId, ids),
						),
					),
				),
		]);
		const friendIds = new Set(friends.map(({ id }) => id));
		const asked = new Set(requests.map(({ toId }) => toId));
		const askedBy = new Set(requests.map(({ fromId }) => fromId));
		return players.map((player) => ({
			...player,
			relation: friendIds.has(player.userId)
				? "friend"
				: asked.has(player.userId)
					? "requested"
					: askedBy.has(player.userId)
						? "requested-you"
						: "none",
		}));
	}
}
