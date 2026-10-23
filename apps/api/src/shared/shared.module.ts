import { Global, Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { Clock } from "./application/clock.js";
import {
	HEALTH_INDICATORS,
	type HealthIndicator,
} from "./application/health-indicator.js";
import { DatabaseHealthIndicator } from "./infrastructure/database/index.js";
import { RedisHealthIndicator } from "./infrastructure/redis/index.js";
import { SystemClock } from "./infrastructure/system-clock.js";
import { DomainErrorFilter } from "./presentation/domain-error.filter.js";

/** Cross-cutting building blocks available to every module. */
@Global()
@Module({
	providers: [
		{ provide: Clock, useClass: SystemClock },
		{ provide: APP_FILTER, useClass: DomainErrorFilter },
		{
			provide: HEALTH_INDICATORS,
			inject: [DatabaseHealthIndicator, RedisHealthIndicator],
			useFactory: (...indicators: HealthIndicator[]) => indicators,
		},
	],
	exports: [Clock, HEALTH_INDICATORS],
})
export class SharedModule {}
