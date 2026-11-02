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
	type FriendPresence,
	GetFriendsPresenceQuery,
} from "./get-friends-presence.query.js";

@QueryHandler(GetFriendsPresenceQuery)
export class GetFriendsPresenceHandler implements IQueryHandler<GetFriendsPresenceQuery> {
	constructor(
		@InjectDatabase() private readonly db: Database,
		private readonly presence: PlayerPresence,
		private readonly queryBus: QueryBus,
	) {}

	async execute({
		userId,
	}: GetFriendsPresenceQuery): Promise<readonly FriendPresence[]> {
		const friendIds = await friendIdsOf(this.db, userId);
		const whereabouts = await this.presence.whereabouts(friendIds);
		return Promise.all(
			friendIds.map(async (friendId) => ({
				userId: friendId,
				presence: await presenceAsSeenBy(
					this.queryBus,
					whereabouts.get(friendId) ?? NOWHERE,
					userId,
				),
			})),
		);
	}
}
