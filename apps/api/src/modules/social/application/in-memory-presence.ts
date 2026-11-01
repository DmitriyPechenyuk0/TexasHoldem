import type { Whereabouts } from "../domain/presence.js";
import { PlayerPresence } from "./player-presence.js";

/** Presence for handler tests, with the Redis one's rules, without connections running out. */
export class InMemoryPresence extends PlayerPresence {
	readonly connections = new Map<string, Set<string>>();
	readonly online = new Set<string>();
	readonly seats = new Map<string, Set<string>>();

	async connect(userId: string, connectionId: string): Promise<boolean> {
		const connections = this.connections.get(userId) ?? new Set<string>();
		connections.add(connectionId);
		this.connections.set(userId, connections);
		const shown = this.online.has(userId);
		this.online.add(userId);
		return !shown;
	}

	async disconnect(userId: string, connectionId: string): Promise<void> {
		this.connections.get(userId)?.delete(connectionId);
	}

	async settle(userId: string): Promise<boolean> {
		if ((this.connections.get(userId)?.size ?? 0) > 0) {
			return false;
		}
		return this.online.delete(userId);
	}

	async shownOnline(): Promise<readonly string[]> {
		return [...this.online];
	}

	async seat(
		tableId: string,
		userIds: readonly string[],
	): Promise<readonly string[]> {
		const before = this.seats.get(tableId) ?? new Set<string>();
		const now = new Set(userIds);
		this.seats.set(tableId, now);
		return [
			...[...before].filter((userId) => !now.has(userId)),
			...userIds.filter((userId) => !before.has(userId)),
		];
	}

	async whereabouts(
		userIds: readonly string[],
	): Promise<ReadonlyMap<string, Whereabouts>> {
		return new Map(
			userIds.map((userId) => [
				userId,
				{
					online: this.online.has(userId),
					tables: [...this.seats]
						.filter(([, players]) => players.has(userId))
						.map(([tableId]) => tableId),
				},
			]),
		);
	}
}
