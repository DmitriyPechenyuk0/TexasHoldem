import { Global, Module } from "@nestjs/common";
import { IntegrationEventBus } from "../../application/integration-events.js";
import { RedisIntegrationEventBus } from "./redis-integration-event-bus.js";

/** `IntegrationEventBus` for every module; needs the CQRS module and Redis. */
@Global()
@Module({
	providers: [
		{ provide: IntegrationEventBus, useClass: RedisIntegrationEventBus },
	],
	exports: [IntegrationEventBus],
})
export class IntegrationEventsModule {}
