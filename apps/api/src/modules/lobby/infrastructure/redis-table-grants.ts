import { Injectable } from "@nestjs/common";
import {
	InjectRedis,
	type Redis,
} from "@/shared/infrastructure/redis/index.js";
import { TableGrants } from "../application/table-grants.js";

/** How long a grant lasts after it was last used. */
export const GRANT_TTL_SECONDS = 24 * 60 * 60;

const keyOf = (tableId: string, userId: string) =>
	`lobby:grant:${tableId}:${userId}`;

/** Grants in Redis, each a key that expires a day after it was last used. */
@Injectable()
export class RedisTableGrants extends TableGrants {
	constructor(@InjectRedis() private readonly redis: Redis) {
		super();
	}

	async grant(tableId: string, userId: string): Promise<void> {
		await this.redis.set(keyOf(tableId, userId), "1", {
			expiration: { type: "EX", value: GRANT_TTL_SECONDS },
		});
	}

	async holds(tableId: string, userId: string): Promise<boolean> {
		return (
			(await this.redis.expire(keyOf(tableId, userId), GRANT_TTL_SECONDS)) === 1
		);
	}
}
