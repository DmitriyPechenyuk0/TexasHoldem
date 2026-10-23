import { Global, Module } from "@nestjs/common";
import { RedisConnections } from "./redis-connections.js";
import { RedisHealthIndicator } from "./redis-health.indicator.js";
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
	],
	exports: [RedisConnections, REDIS, RedisHealthIndicator],
})
export class RedisModule {}
