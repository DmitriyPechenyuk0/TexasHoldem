import {
	Injectable,
	Logger,
	type OnApplicationBootstrap,
	type OnApplicationShutdown,
} from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import { CloseIdleTablesCommand } from "./commands/close-idle-tables/close-idle-tables.command.js";

/** How often idle tables are looked for. Every instance looks; a table closes once. */
export const IDLE_SWEEP_EVERY_MS = 60_000;

/** Sweeps for tables empty for too long (POK-98), every minute on every instance. */
@Injectable()
export class IdleTablesScheduler
	implements OnApplicationBootstrap, OnApplicationShutdown
{
	private readonly logger = new Logger(IdleTablesScheduler.name);
	private timer: ReturnType<typeof setInterval> | null = null;

	constructor(private readonly commandBus: CommandBus) {}

	onApplicationBootstrap(): void {
		this.timer = setInterval(() => void this.sweep(), IDLE_SWEEP_EVERY_MS);
		this.timer.unref();
	}

	onApplicationShutdown(): void {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
	}

	private async sweep(): Promise<void> {
		try {
			await this.commandBus.execute(new CloseIdleTablesCommand());
		} catch (error) {
			this.logger.error({ msg: "idle tables not swept", err: error });
		}
	}
}
