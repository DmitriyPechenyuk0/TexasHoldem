import {
	Injectable,
	Logger,
	type OnModuleDestroy,
	type OnModuleInit,
} from "@nestjs/common";
import { EventBus } from "@nestjs/cqrs";
import { PresenceChanged } from "./events/presence-changed.event.js";
import { PlayerPresence } from "./player-presence.js";

/** How long a player stays online after their last connection closed: a reload shows nothing. */
export const OFFLINE_GRACE_MS = 5_000;

/** How often each instance settles every player shown online, for those whose instance stopped. */
export const SWEEP_EVERY_MS = 30_000;

/**
 * Takes players offline: a grace period after their last connection here closed, and in a sweep
 * for connections that ran out on an instance that stopped. Settling is atomic, so every instance
 * sweeps, and a player goes offline once.
 */
@Injectable()
export class PresenceSettler implements OnModuleInit, OnModuleDestroy {
	private readonly logger = new Logger(PresenceSettler.name);
	private readonly pending = new Map<string, ReturnType<typeof setTimeout>>();
	private sweeper: ReturnType<typeof setInterval> | null = null;

	constructor(
		private readonly presence: PlayerPresence,
		private readonly eventBus: EventBus,
	) {}

	onModuleInit(): void {
		this.sweeper = setInterval(() => void this.sweep(), SWEEP_EVERY_MS);
		this.sweeper.unref();
	}

	onModuleDestroy(): void {
		if (this.sweeper) {
			clearInterval(this.sweeper);
			this.sweeper = null;
		}
		for (const timer of this.pending.values()) {
			clearTimeout(timer);
		}
		this.pending.clear();
	}

	/** Settles the player once the grace period is over. */
	later(userId: string): void {
		clearTimeout(this.pending.get(userId));
		const timer = setTimeout(() => {
			this.pending.delete(userId);
			void this.settle(userId);
		}, OFFLINE_GRACE_MS);
		timer.unref();
		this.pending.set(userId, timer);
	}

	async sweep(): Promise<void> {
		try {
			const players = await this.presence.shownOnline();
			await Promise.all(players.map((userId) => this.settle(userId)));
		} catch (error) {
			this.logger.warn({ msg: "presence not swept", err: error });
		}
	}

	private async settle(userId: string): Promise<void> {
		if (await this.presence.settle(userId)) {
			this.eventBus.publish(new PresenceChanged(userId));
		}
	}
}
