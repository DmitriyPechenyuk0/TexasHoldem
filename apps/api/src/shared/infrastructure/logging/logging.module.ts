import { Global, Module } from "@nestjs/common";
import { LoggerModule } from "nestjs-pino";
import { LogContext } from "../../application/log-context.js";
import { AppConfig } from "../config/index.js";
import { CommandLogging } from "./command-logging.js";
import {
	LOG_DESTINATION,
	logDestinationFor,
	loggerParams,
} from "./logger-params.js";
import { PinoLogContext } from "./pino-log-context.js";

@Global()
@Module({
	imports: [
		LoggerModule.forRootAsync({
			providers: [
				{
					provide: LOG_DESTINATION,
					inject: [AppConfig],
					useFactory: logDestinationFor,
				},
			],
			inject: [AppConfig, LOG_DESTINATION],
			useFactory: loggerParams,
		}),
	],
	providers: [
		CommandLogging,
		{ provide: LogContext, useClass: PinoLogContext },
	],
	exports: [LogContext],
})
export class LoggingModule {}
