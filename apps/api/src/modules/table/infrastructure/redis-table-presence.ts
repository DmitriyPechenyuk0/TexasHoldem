import {
	Injectable,
	Logger,
	type OnModuleDestroy,
	type OnModuleInit,
} from "@nestjs/common";
import { Clock } from "@/shared/application/clock.js";
import {
	InjectRedis,
	type Redis,
} from "@/shared/infrastructure/redis/index.js";
import { TablePresence } from "../application/table-presence.js";

/**
 * How long a connection counts without being refreshed. Each instance refreshes the connections it
 * holds well within it, so only those of an instance that stopped without closing them run out.
 */
export const PRESENCE_TTL_MS = 60_000;
const REFRESH_MS = PRESENCE_TTL_MS / 3;

// A sorted set per user and table: connection ids scored by when they run out. Each script drops
// the run-out ones first, and runs in one step, so of two last connections closing at once on two
// instances, exactly one sees none left.
const CONNECT = `
redis.call("ZREMRANGEBYSCORE", KEYS[1], "-inf", ARGV[1])
local before = redis.call("ZCARD", KEYS[1])
redis.call("ZADD", KEYS[1], ARGV[2], ARGV[3])
redis.call("PEXPIRE", KEYS[1], ARGV[4])
return before
`;
const DISCONNECT = `
redis.call("ZREM", KEYS[1], ARGV[2])
redis.call("ZREMRANGEBYSCORE", KEYS[1], "-inf", ARGV[1])
return redis.call("ZCARD", KEYS[1])
`;

const keyOf = (tableId: string, userId: string) =>
	`table-presence:${tableId}:${userId}`;

/**
 * Table presence shared by every instance through Redis. While Redis cannot be reached, nobody is
 * reported as back or gone: players then play on under the usual turn timer, rather than being
 * sat out because an outage hid their connections.
 */
@Injectable()
export class RedisTablePresence
	extends TablePresence
	implements OnModuleInit, OnModuleDestroy
{
	private readonly logger = new Logger(TablePresence.name);
	/** The connections this instance holds, by key, to refresh them. */
	private readonly held = new Map<string, Set<string>>();
	private refresher: ReturnType<typeof setInterval> | null = null;
	private failing = false;

	constructor(
		@InjectRedis() private readonly redis: Redis,
		private readonly clock: Clock,
	) {
		super();
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

	async connect(
		tableId: string,
		userId: string,
		connectionId: string,
	): Promise<boolean> {
		const key = keyOf(tableId, userId);
		let connections = this.held.get(key);
		if (!connections) {
			connections = new Set();
			this.held.set(key, connections);
		}
		connections.add(connectionId);
		const now = this.clock.now().getTime();
		const before = await this.tryEval(CONNECT, key, [
			String(now),
			String(now + PRESENCE_TTL_MS),
			connectionId,
			String(PRESENCE_TTL_MS),
		]);
		return before === 0;
	}

	async disconnect(
		tableId: string,
		userId: string,
		connectionId: string,
	): Promise<boolean> {
		const key = keyOf(tableId, userId);
		const connections = this.held.get(key);
		connections?.delete(connectionId);
		if (connections?.size === 0) {
			this.held.delete(key);
		}
		const left = await this.tryEval(DISCONNECT, key, [
			String(this.clock.now().getTime()),
			connectionId,
		]);
		return left === 0;
	}

	/** Pushes back when this instance's connections run out; one that ran out is added again. */
	private async refresh(): Promise<void> {
		if (this.held.size === 0) {
			return;
		}
		const expiresAt = this.clock.now().getTime() + PRESENCE_TTL_MS;
		const batch = this.redis.multi();
		for (const [key, connections] of this.held) {
			batch.zAdd(
				key,
				[...connections].map((value) => ({ score: expiresAt, value })),
			);
			batch.pExpire(key, PRESENCE_TTL_MS);
		}
		try {
			await batch.exec();
			this.failing = false;
		} catch (error) {
			this.warnOnce(error);
		}
	}

	/** The script's count, or null while Redis fails. */
	private async tryEval(
		script: string,
		key: string,
		args: string[],
	): Promise<number | null> {
		try {
			const count = (await this.redis.eval(script, {
				keys: [key],
				arguments: args,
			})) as number;
			this.failing = false;
			return count;
		} catch (error) {
			this.warnOnce(error);
			return null;
		}
	}

	private warnOnce(error: unknown): void {
		if (!this.failing) {
			this.failing = true;
			this.logger.warn(
				`Table presence is unknown until Redis answers: ${(error as Error).message}`,
			);
		}
	}
}
