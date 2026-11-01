import { Injectable, Logger, type OnApplicationShutdown } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import { ConcurrencyError } from "@/shared/application/event-store.js";
import { AppConfig } from "@/shared/infrastructure/config/index.js";
import { StartNextHandCommand } from "../application/commands/start-next-hand/start-next-hand.command.js";
import { HandScheduler } from "../application/hand-scheduler.js";

/**
 * Deals the next hand with a timer per table, in this process. A deal that lost a race to another
 * command is tried again after the pause. The table runtime (POK-77) will run these deals in the
 * table's mailbox, in order with every other command.
 */
@Injectable()
export class TimerHandScheduler
	extends HandScheduler
	implements OnApplicationShutdown
{
	private readonly logger = new Logger(TimerHandScheduler.name);
	private readonly timers = new Map<string, NodeJS.Timeout>();

	constructor(
		private readonly commandBus: CommandBus,
		private readonly config: AppConfig,
	) {
		super();
	}

	schedule(tableId: string): void {
		if (this.timers.has(tableId)) {
			return;
		}
		const timer = setTimeout(() => {
			this.timers.delete(tableId);
			void this.deal(tableId);
		}, this.config.table.handPauseMs);
		this.timers.set(tableId, timer);
	}

	onApplicationShutdown(): void {
		for (const timer of this.timers.values()) {
			clearTimeout(timer);
		}
		this.timers.clear();
	}

	private async deal(tableId: string): Promise<void> {
		try {
			await this.commandBus.execute(new StartNextHandCommand(tableId));
		} catch (error) {
			if (error instanceof ConcurrencyError) {
				this.schedule(tableId);
				return;
			}
			// A bug: the command only deals when the table is ready.
			this.logger.error({ msg: "next hand not dealt", tableId, err: error });
		}
	}
}
