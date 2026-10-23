import { Global, Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { Clock } from "./application/clock.js";
import { SystemClock } from "./infrastructure/system-clock.js";
import { DomainErrorFilter } from "./presentation/domain-error.filter.js";

/** Cross-cutting building blocks available to every module. */
@Global()
@Module({
	providers: [
		{ provide: Clock, useClass: SystemClock },
		{ provide: APP_FILTER, useClass: DomainErrorFilter },
	],
	exports: [Clock],
})
export class SharedModule {}
