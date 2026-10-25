import { Global, Module } from "@nestjs/common";
import { RateLimiter } from "../../application/rate-limiter.js";
import { RedisConnections } from "./redis-connections.js";
import { RedisHealthIndicator } from "./redis-health.indicator.js";
import {
	RATE_LIMIT_NAMESPACE,
	RedisRateLimiter,
} from "./redis-rate-limiter.js";
import { REDIS } from "./redis.js";

@Global()
@Module({
	providers: [
		RedisConnections,
		{
			provide: REDIS,
			inject: [RedisConnections],
			useFactory: (connections: RedisConnections) => connections.open("shared"),
		},
		RedisHealthIndicator,
		{ provide: RATE_LIMIT_NAMESPACE, useValue: "rate-limit" },
		{ provide: RateLimiter, useClass: RedisRateLimiter },
	],
	exports: [RedisConnections, REDIS, RedisHealthIndicator, RateLimiter],
})
export class RedisModule {}
