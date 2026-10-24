import { Injectable, type OnModuleInit } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";
import { DomainError } from "../../domain/domain-error.js";

/**
 * Logs every command at debug level: name, duration and outcome (`succeeded`, `rejected` by a
 * domain rule, or `failed` with a bug). `@nestjs/cqrs` has no interceptor hook, so this wraps the
 * public `execute` of the one `CommandBus` instance; every caller shares it, and no handler can opt out.
 */
@Injectable()
export class CommandLogging implements OnModuleInit {
	constructor(
		private readonly commandBus: CommandBus,
		@InjectPinoLogger("CommandBus") private readonly logger: PinoLogger,
	) {}

	onModuleInit(): void {
		const execute = this.commandBus.execute.bind(this.commandBus);
		const logger = this.logger;

		this.commandBus.execute = async function loggedExecute(
			...args: Parameters<typeof execute>
		) {
			const command = args[0].constructor.name;
			const startedAt = performance.now();
			const durationMs = () =>
				Math.round((performance.now() - startedAt) * 100) / 100;
			try {
				const result = await execute(...args);
				logger.debug(
					{ command, durationMs: durationMs(), outcome: "succeeded" },
					"command handled",
				);
				return result;
			} catch (error) {
				logger.debug(
					error instanceof DomainError
						? {
								command,
								durationMs: durationMs(),
								outcome: "rejected",
								code: error.code,
							}
						: {
								command,
								durationMs: durationMs(),
								outcome: "failed",
								error: error instanceof Error ? error.name : String(error),
							},
					"command handled",
				);
				throw error;
			}
		} as typeof this.commandBus.execute;
	}
}
