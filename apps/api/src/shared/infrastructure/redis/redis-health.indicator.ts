import { Injectable } from "@nestjs/common";
import { HealthIndicator } from "../../application/health-indicator.js";
import { InjectRedis, type Redis } from "./redis.js";

@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
	readonly name = "redis";

	constructor(@InjectRedis() private readonly redis: Redis) {
		super();
	}

	async isHealthy(): Promise<boolean> {
		// While disconnected, a PING would wait in the offline queue instead of failing.
		if (!this.redis.isReady) {
			return false;
		}
		try {
			return (await this.redis.ping()) === "PONG";
		} catch {
			return false;
		}
	}
}
