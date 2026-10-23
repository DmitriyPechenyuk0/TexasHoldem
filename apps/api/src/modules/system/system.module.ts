import { Module } from "@nestjs/common";
import { GetServerTimeHandler } from "./application/queries/get-server-time/get-server-time.handler.js";
import { SystemController } from "./presentation/system.controller.js";

/** Reference module: the full path controller → query bus → handler, with no domain of its own. */
@Module({
	controllers: [SystemController],
	providers: [GetServerTimeHandler],
})
export class SystemModule {}
