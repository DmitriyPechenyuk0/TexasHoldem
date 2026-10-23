import { Module } from "@nestjs/common";
import { GetReadinessHandler } from "./application/queries/get-readiness/get-readiness.handler.js";
import { GetServerTimeHandler } from "./application/queries/get-server-time/get-server-time.handler.js";
import { HealthController } from "./presentation/health.controller.js";
import { SystemController } from "./presentation/system.controller.js";

/** Reference module (controller → query bus → handler) plus the health endpoints. It has no domain of its own. */
@Module({
	controllers: [HealthController, SystemController],
	providers: [GetReadinessHandler, GetServerTimeHandler],
})
export class SystemModule {}
