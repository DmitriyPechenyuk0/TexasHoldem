import {
	Injectable,
	Logger,
	type OnModuleDestroy,
	type OnModuleInit,
} from "@nestjs/common";
import { Clock } from "@/shared/application/clock.js";
import { AppConfig } from "@/shared/infrastructure/config/index.js";
import {
	InjectRedis,
	type Redis,
} from "@/shared/infrastructure/redis/index.js";
import { PlayerPresence } from "../application/player-presence.js";
import type { Whereabouts } from "../domain/presence.js";

/**
 * How long a connection counts without being refreshed. Each instance refreshes the connections it
 * holds well within it, so only those of an instance that stopped without closing them run out.
 */
export const CONNECTION_TTL_MS = 60_000;
const REFRESH_MS = CONNECTION_TTL_MS / 3;

// Per player, a sorted set of connection ids scored by when they run out, and one set of the
// players shown online. Each script runs in one step: of two instances settling a player at once,
// exactly one takes them offline, and a connection racing a settle either keeps them online or
// shows them online again.
const CONNECT = `
redis.call("ZREMRANGEBYSCORE", KEYS[1], "-inf", ARGV[1])
redis.call("ZADD", KEYS[1], ARGV[2], ARGV[3])
redis.call("PEXPIRE", KEYS[1], ARGV[4])
return redis.call("SADD", KEYS[2], ARGV[5])
`;
const SETTLE = `
redis.call("ZREMRANGEBYSCORE", KEYS[1], "-inf", ARGV[1])
if redis.call("ZCARD", KEYS[1]) > 0 then return 0 end
return redis.call("SREM", KEYS[2], ARGV[2])
`;
// Who sits at a table, and the tables each player sits at (ARGV[2] prefixes the latter's keys).
// Answers the players who sat down or left.
const SEAT = `
local tableId, prefix = ARGV[1], ARGV[2]
local now = {}
for i = 3, #ARGV do now[ARGV[i]] = true end
local changed = {}
for _, userId in ipairs(redis.call("SMEMBERS", KEYS[1])) do
	if now[userId] then
		now[userId] = nil
	else
		redis.call("SREM", KEYS[1], userId)
		redis.call("SREM", prefix .. userId, tableId)
		table.insert(changed, userId)
	end
end
for userId in pairs(now) do
	redis.call("SADD", KEYS[1], userId)
	redis.call("SADD", prefix .. userId, tableId)
	table.insert(changed, userId)
end
return changed
`;

/**
 * Presence shared by every instance through Redis. Keys start with the database's name, so
 * environments that share one Redis (the tests) never see each other's players. While Redis
 * cannot be reached, nobody comes online or goes offline.
 */
@Injectable()
export class RedisPlayerPresence
	extends PlayerPresence
	implements OnModuleInit, OnModuleDestroy
{
	private readonly logger = new Logger(PlayerPresence.name);
	private readonly prefix: string;
	/** The connections this instance holds, by player, to refresh them. */
	private readonly held = new Map<string, Set<string>>();
	private refresher: ReturnType<typeof setInterval> | null = null;
	private failing = false;

	constructor(
		@InjectRedis() private readonly redis: Redis,
		private readonly clock: Clock,
		config: AppConfig,
	) {
		super();
		this.prefix = `${new URL(config.database.url).pathname.slice(1)}:presence`;
	}

	onModuleInit(): void {
		this.refresher = setInterval(() => void this.refresh(), REFRESH_MS);
		this.refresher.unref();
	}

	onModuleDestroy(): void {
		if (this.refresher) {
			clearInterval(this.refresher);
			this.refresher = null;
		}
	}

	async connect(userId: string, connectionId: string): Promise<boolean> {
		let connections = this.held.get(userId);
		if (!connections) {
			connections = new Set();
			this.held.set(userId, connections);
		}
		connections.add(connectionId);
		const now = this.clock.now().getTime();
		const added = await this.tryEval(
			CONNECT,
			[this.connectionsKey(userId), this.onlineKey()],
			[
				String(now),
				String(now + CONNECTION_TTL_MS),
				connectionId,
				String(CONNECTION_TTL_MS),
				userId,
			],
		);
		return added === 1;
	}

	async disconnect(userId: string, connectionId: string): Promise<void> {
		const connections = this.held.get(userId);
		connections?.delete(connectionId);
		if (connections?.size === 0) {
			this.held.delete(userId);
		}
		try {
			await this.redis.zRem(this.connectionsKey(userId), connectionId);
			this.failing = false;
		} catch (error) {
			this.warnOnce(error);
		}
	}

	async settle(userId: string): Promise<boolean> {
		const removed = await this.tryEval(
			SETTLE,
			[this.connectionsKey(userId), this.onlineKey()],
			[String(this.clock.now().getTime()), userId],
		);
		return removed === 1;
	}

	shownOnline(): Promise<readonly string[]> {
		return this.redis.sMembers(this.onlineKey());
	}

	async seat(
		tableId: string,
		userIds: readonly string[],
	): Promise<readonly string[]> {
		return (await this.redis.eval(SEAT, {
			keys: [`${this.prefix}:table:${tableId}`],
			arguments: [tableId, `${this.prefix}:tables:`, ...userIds],
		})) as string[];
	}

	async whereabouts(
		userIds: readonly string[],
	): Promise<ReadonlyMap<string, Whereabouts>> {
		if (userIds.length === 0) {
			return new Map();
		}
		const batch = this.redis.multi();
		batch.smIsMember(this.onlineKey(), [...userIds]);
		for (const userId of userIds) {
			batch.sMembers(this.tablesKey(userId));
		}
		const [online, ...tables] = (await batch.exec()) as unknown as [
			number[],
			...string[][],
		];
		return new Map(
			userIds.map((userId, index) => [
				userId,
				{ online: online[index] === 1, tables: tables[index] ?? [] },
			]),
		);
	}

	/** Pushes back when this instance's connections run out; one that ran out is added again. */
	private async refresh(): Promise<void> {
		if (this.held.size === 0) {
			return;
		}
		const expiresAt = this.clock.now().getTime() + CONNECTION_TTL_MS;
		const batch = this.redis.multi();
		for (const [userId, connections] of this.held) {
			const key = this.connectionsKey(userId);
			batch.zAdd(
				key,
				[...connections].map((value) => ({ score: expiresAt, value })),
			);
			batch.pExpire(key, CONNECTION_TTL_MS);
		}
		try {
			await batch.exec();
			this.failing = false;
		} catch (error) {
			this.warnOnce(error);
		}
	}

	/** The script's answer, or null while Redis fails. */
	private async tryEval(
		script: string,
		keys: string[],
		args: string[],
	): Promise<number | null> {
		try {
			const answer = (await this.redis.eval(script, {
				keys,
				arguments: args,
			})) as number;
			this.failing = false;
			return answer;
		} catch (error) {
			this.warnOnce(error);
			return null;
		}
	}

	private warnOnce(error: unknown): void {
		if (!this.failing) {
			this.failing = true;
			this.logger.warn(
				`Presence stays as it is until Redis answers: ${(error as Error).message}`,
			);
		}
	}

	private connectionsKey(userId: string): string {
		return `${this.prefix}:connections:${userId}`;
	}

	private tablesKey(userId: string): string {
		return `${this.prefix}:tables:${userId}`;
	}

	private onlineKey(): string {
		return `${this.prefix}:online`;
	}
}
