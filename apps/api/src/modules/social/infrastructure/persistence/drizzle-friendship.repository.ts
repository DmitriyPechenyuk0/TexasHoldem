import { Injectable } from "@nestjs/common";
import { and, count, eq, or, sql } from "drizzle-orm";
import {
	type Database,
	InjectDatabase,
	inTransaction,
	type Transaction,
} from "@/shared/infrastructure/database/index.js";
import type { Standing } from "../../domain/friendship.js";
import {
	FriendshipRepository,
	type Friendships,
} from "../../domain/friendship.repository.js";
import { friendRequests, friendships } from "./schema.js";

@Injectable()
export class DrizzleFriendshipRepository extends FriendshipRepository {
	constructor(@InjectDatabase() private readonly db: Database) {
		super();
	}

	/** Advisory locks per player, taken in one order so two units of work never wait on each other. */
	locked<T>(
		userIds: readonly string[],
		work: (friendships: Friendships) => Promise<T>,
	): Promise<T> {
		return inTransaction(this.db, async (tx) => {
			for (const userId of [...new Set(userIds)].sort()) {
				await tx.execute(
					sql`select pg_advisory_xact_lock(hashtextextended(${`social:${userId}`}, 0))`,
				);
			}
			return work(new DrizzleFriendships(tx));
		});
	}
}

class DrizzleFriendships implements Friendships {
	constructor(private readonly tx: Transaction) {}

	async standing(me: string, them: string): Promise<Standing> {
		// One after another: a transaction's client runs one query at a time.
		const friends = await this.tx
			.select({ since: friendships.since })
			.from(friendships)
			.where(and(eq(friendships.userId, me), eq(friendships.friendId, them)));
		const requests = await this.tx
			.select({ fromId: friendRequests.fromId })
			.from(friendRequests)
			.where(
				or(
					and(eq(friendRequests.fromId, me), eq(friendRequests.toId, them)),
					and(eq(friendRequests.fromId, them), eq(friendRequests.toId, me)),
				),
			);
		const myFriends = await this.friendCount(me);
		const theirFriends = await this.friendCount(them);
		const myPending = await this.tx
			.select({ requests: count() })
			.from(friendRequests)
			.where(eq(friendRequests.fromId, me));
		return {
			me,
			them,
			friends: friends.length > 0,
			requested: requests.some(({ fromId }) => fromId === me),
			requestedBack: requests.some(({ fromId }) => fromId === them),
			myFriends,
			theirFriends,
			myPendingRequests: myPending[0]?.requests ?? 0,
		};
	}

	private async friendCount(userId: string): Promise<number> {
		const [row] = await this.tx
			.select({ friends: count() })
			.from(friendships)
			.where(eq(friendships.userId, userId));
		return row?.friends ?? 0;
	}

	async addRequest(fromId: string, toId: string, at: Date): Promise<void> {
		await this.tx.insert(friendRequests).values({ fromId, toId, sentAt: at });
	}

	async removeRequest(fromId: string, toId: string): Promise<void> {
		await this.tx
			.delete(friendRequests)
			.where(
				and(eq(friendRequests.fromId, fromId), eq(friendRequests.toId, toId)),
			);
	}

	async befriend(a: string, b: string, at: Date): Promise<void> {
		await this.tx
			.delete(friendRequests)
			.where(
				or(
					and(eq(friendRequests.fromId, a), eq(friendRequests.toId, b)),
					and(eq(friendRequests.fromId, b), eq(friendRequests.toId, a)),
				),
			);
		await this.tx.insert(friendships).values([
			{ userId: a, friendId: b, since: at },
			{ userId: b, friendId: a, since: at },
		]);
	}

	async unfriend(a: string, b: string): Promise<void> {
		await this.tx
			.delete(friendships)
			.where(
				or(
					and(eq(friendships.userId, a), eq(friendships.friendId, b)),
					and(eq(friendships.userId, b), eq(friendships.friendId, a)),
				),
			);
	}
}
