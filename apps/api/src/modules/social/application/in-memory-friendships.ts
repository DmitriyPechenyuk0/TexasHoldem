import type { Standing } from "../domain/friendship.js";
import {
	FriendshipRepository,
	type Friendships,
} from "../domain/friendship.repository.js";

/** The repository for handler tests, with the Postgres one's rules; `locks` lists who was locked. */
export class InMemoryFriendships
	extends FriendshipRepository
	implements Friendships
{
	/** `from→to`. */
	readonly requests = new Map<string, Date>();
	/** `user→friend`, both ways. */
	readonly friendships = new Map<string, Date>();
	readonly locks: (readonly string[])[] = [];

	async locked<T>(
		userIds: readonly string[],
		work: (friendships: Friendships) => Promise<T>,
	): Promise<T> {
		this.locks.push(userIds);
		return work(this);
	}

	async standing(me: string, them: string): Promise<Standing> {
		const from = (userId: string, map: Map<string, Date>) =>
			[...map.keys()].filter((key) => key.startsWith(`${userId}→`)).length;
		return {
			me,
			them,
			friends: this.friendships.has(`${me}→${them}`),
			requested: this.requests.has(`${me}→${them}`),
			requestedBack: this.requests.has(`${them}→${me}`),
			myFriends: from(me, this.friendships),
			theirFriends: from(them, this.friendships),
			myPendingRequests: from(me, this.requests),
		};
	}

	async addRequest(fromId: string, toId: string, at: Date): Promise<void> {
		this.requests.set(`${fromId}→${toId}`, at);
	}

	async removeRequest(fromId: string, toId: string): Promise<void> {
		this.requests.delete(`${fromId}→${toId}`);
	}

	async befriend(a: string, b: string, at: Date): Promise<void> {
		this.requests.delete(`${a}→${b}`);
		this.requests.delete(`${b}→${a}`);
		this.friendships.set(`${a}→${b}`, at);
		this.friendships.set(`${b}→${a}`, at);
	}

	async unfriend(a: string, b: string): Promise<void> {
		this.friendships.delete(`${a}→${b}`);
		this.friendships.delete(`${b}→${a}`);
	}
}

export const NOW = new Date("2026-11-02T10:00:00Z");

/** The handlers' other ports: a fixed clock, and the events they published. */
export function handlerPorts() {
	const published: unknown[] = [];
	return {
		published,
		events: { publish: (...events: unknown[]) => published.push(...events) },
		clock: { now: () => NOW },
	};
}
