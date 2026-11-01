import { type IQueryHandler, QueryBus, QueryHandler } from "@nestjs/cqrs";
import {
	type Database,
	InjectDatabase,
} from "@/shared/infrastructure/database/index.js";
import { NOWHERE } from "../../../domain/presence.js";
import { PlayerPresence } from "../../player-presence.js";
import { presenceAsSeenBy } from "../../presence-as-seen.js";
import { friendIdsOf } from "../friend-ids.js";
import {
	GetPresenceWatchersQuery,
	type PresenceWatcher,
} from "./get-presence-watchers.query.js";

@QueryHandler(GetPresenceWatchersQuery)
export class GetPresenceWatchersHandler implements IQueryHandler<GetPresenceWatchersQuery> {
	constructor(
		@InjectDatabase() private readonly db: Database,
		private readonly presence: PlayerPresence,
		private readonly queryBus: QueryBus,
	) {}

	async execute({
		userId,
	}: GetPresenceWatchersQuery): Promise<readonly PresenceWatcher[]> {
		const friendIds = await friendIdsOf(this.db, userId);
		const whereabouts = await this.presence.whereabouts([userId, ...friendIds]);
		const own = whereabouts.get(userId) ?? NOWHERE;
		const online = friendIds.filter(
			(friendId) => whereabouts.get(friendId)?.online,
		);
		return Promise.all(
			online.map(async (viewerId) => ({
				viewerId,
				presence: await presenceAsSeenBy(this.queryBus, own, viewerId),
			})),
		);
	}
}
