import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { AppConfig } from "@/shared/infrastructure/config/index.js";
import {
	InjectRedis,
	type Redis,
} from "@/shared/infrastructure/redis/index.js";
import { TableRuntimeOptions } from "../application/runtime/table-runtime-options.js";
import { type TableLease, TableLeases } from "../application/table-leases.js";

// The owner key holds `<instanceId>:<epoch>` and expires unless renewed. Each script runs in one
// step, so two instances never both take a lease.
const ACQUIRE = `
local owner = redis.call("GET", KEYS[1])
if owner and string.match(owner, "^(.*):%d+$") ~= ARGV[1] then
	return false
end
local epoch = redis.call("INCR", KEYS[2])
local atLeast = tonumber(ARGV[2])
if epoch <= atLeast then
	epoch = atLeast + 1
	redis.call("SET", KEYS[2], epoch)
end
redis.call("SET", KEYS[1], ARGV[1] .. ":" .. epoch, "PX", ARGV[3])
redis.call("SADD", KEYS[3], ARGV[4])
return epoch
`;
const RENEW = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
	return redis.call("PEXPIRE", KEYS[1], ARGV[2])
end
return 0
`;
const RELEASE = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
	redis.call("DEL", KEYS[1])
	redis.call("SREM", KEYS[2], ARGV[2])
end
return 0
`;

/**
 * Table leases in Redis (ADR-004): `table:<id>:owner` is `SET … PX <ttl>` by its holder, with an
 * epoch from `table:<id>:epoch` that grows with every holder, and `tables:leased` lists every
 * lease taken and not released. While Redis cannot be reached no lease changes hands, so no table
 * moves. Keys start with the database's name: leases are over its streams, so environments that
 * share one Redis (the tests) never take each other's tables.
 */
@Injectable()
export class RedisTableLeases extends TableLeases {
	readonly instanceId = randomUUID();
	private readonly prefix: string;

	constructor(
		@InjectRedis() private readonly redis: Redis,
		private readonly options: TableRuntimeOptions,
		config: AppConfig,
	) {
		super();
		this.prefix = new URL(config.database.url).pathname.slice(1);
	}

	async acquire(tableId: string, atLeast: number): Promise<TableLease | null> {
		const epoch = (await this.redis.eval(ACQUIRE, {
			keys: [this.ownerKey(tableId), this.epochKey(tableId), this.leasedKey],
			arguments: [
				this.instanceId,
				String(atLeast),
				String(this.options.leaseTtlMs),
				tableId,
			],
		})) as number | null;
		return epoch === null ? null : { tableId, epoch };
	}

	async ownerOf(tableId: string): Promise<string | null> {
		const owner = await this.redis.get(this.ownerKey(tableId));
		return owner ? owner.slice(0, owner.lastIndexOf(":")) : null;
	}

	async renew(lease: TableLease): Promise<boolean> {
		const renewed = await this.redis.eval(RENEW, {
			keys: [this.ownerKey(lease.tableId)],
			arguments: [this.valueOf(lease), String(this.options.leaseTtlMs)],
		});
		return renewed === 1;
	}

	async release(lease: TableLease): Promise<void> {
		await this.redis.eval(RELEASE, {
			keys: [this.ownerKey(lease.tableId), this.leasedKey],
			arguments: [this.valueOf(lease), lease.tableId],
		});
	}

	async orphans(): Promise<readonly string[]> {
		const leased = await this.redis.sMembers(this.leasedKey);
		if (leased.length === 0) {
			return [];
		}
		// Sent together, as one round trip.
		const owners = await Promise.all(
			leased.map((tableId) => this.redis.exists(this.ownerKey(tableId))),
		);
		return leased.filter((_, index) => owners[index] === 0);
	}

	private ownerKey(tableId: string): string {
		return `${this.prefix}:table:${tableId}:owner`;
	}

	private epochKey(tableId: string): string {
		return `${this.prefix}:table:${tableId}:epoch`;
	}

	/** Every table with a lease taken and not released, to find those whose holder stopped. */
	private get leasedKey(): string {
		return `${this.prefix}:tables:leased`;
	}

	private valueOf(lease: TableLease): string {
		return `${this.instanceId}:${lease.epoch}`;
	}
}
