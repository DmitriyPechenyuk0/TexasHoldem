import { Module } from "@nestjs/common";
import { GetReadinessHandler } from "./application/queries/get-readiness/get-readiness.handler.js";
import { GetServerTimeHandler } from "./application/queries/get-server-time/get-server-time.handler.js";
import { HealthController } from "./presentation/health.controller.js";
import { SystemController } from "./presentation/system.controller.js";
import { SystemGateway } from "./presentation/system.gateway.js";

/** Reference module (controller or gateway → query bus → handler) plus the health endpoints. It has no domain of its own. */
@Module({
	controllers: [HealthController, SystemController],
	providers: [GetReadinessHandler, GetServerTimeHandler, SystemGateway],
})
export class SystemModule {}
