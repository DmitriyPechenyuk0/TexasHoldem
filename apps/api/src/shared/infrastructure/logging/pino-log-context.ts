import { Injectable } from "@nestjs/common";
import { PinoLogger } from "nestjs-pino";
import { type LogBindings, LogContext } from "../../application/log-context.js";

/** Runs `fn` in nestjs-pino's AsyncLocalStorage context, the same one HTTP requests use. */
@Injectable()
export class PinoLogContext extends LogContext {
	constructor(private readonly logger: PinoLogger) {
		super();
	}

	run<T>(bindings: LogBindings, fn: () => T): T {
		return this.logger.runInContext(fn, { bindings, inherit: true });
	}
}
