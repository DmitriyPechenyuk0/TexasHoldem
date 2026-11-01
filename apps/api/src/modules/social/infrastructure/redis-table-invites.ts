import { Injectable } from "@nestjs/common";
import { AppConfig } from "@/shared/infrastructure/config/index.js";
import {
	InjectRedis,
	type Redis,
} from "@/shared/infrastructure/redis/index.js";
import {
	type PendingInvite,
	TableInvites,
} from "../application/table-invites.js";

// Per invitee, a sorted set of `inviterId:tableId` scored by when the invite runs out; the key
// itself goes once its last invite has. Taking one runs in one step, so an invite is accepted once.
const TAKE = `
local expiresAt = redis.call("ZSCORE", KEYS[1], ARGV[2])
redis.call("ZREM", KEYS[1], ARGV[2])
if expiresAt and tonumber(expiresAt) > tonumber(ARGV[1]) then return 1 end
return 0
`;

/** Table invites in Redis, under keys prefixed by the database's name, like presence. */
@Injectable()
export class RedisTableInvites extends TableInvites {
	private readonly prefix: string;

	constructor(
		@InjectRedis() private readonly redis: Redis,
		config: AppConfig,
	) {
		super();
		this.prefix = `${new URL(config.database.url).pathname.slice(1)}:table-invites`;
	}

	async add(
		inviteeId: string,
		inviterId: string,
		tableId: string,
		expiresAt: Date,
	): Promise<void> {
		const key = this.keyOf(inviteeId);
		await this.redis
			.multi()
			.zAdd(key, {
				score: expiresAt.getTime(),
				value: `${inviterId}:${tableId}`,
			})
			.pExpireAt(key, expiresAt.getTime(), "GT")
			.pExpireAt(key, expiresAt.getTime(), "NX")
			.exec();
	}

	async take(
		inviteeId: string,
		inviterId: string,
		tableId: string,
		now: Date,
	): Promise<boolean> {
		const taken = (await this.redis.eval(TAKE, {
			keys: [this.keyOf(inviteeId)],
			arguments: [String(now.getTime()), `${inviterId}:${tableId}`],
		})) as number;
		return taken === 1;
	}

	async pending(
		inviteeId: string,
		now: Date,
	): Promise<readonly PendingInvite[]> {
		const key = this.keyOf(inviteeId);
		await this.redis.zRemRangeByScore(key, "-inf", now.getTime());
		const invites = await this.redis.zRangeWithScores(key, "+inf", "-inf", {
			BY: "SCORE",
			REV: true,
		});
		return invites.map(({ value, score }) => {
			const [inviterId = "", tableId = ""] = value.split(":");
			return { inviterId, tableId, expiresAt: new Date(score) };
		});
	}

	private keyOf(inviteeId: string): string {
		return `${this.prefix}:${inviteeId}`;
	}
}
