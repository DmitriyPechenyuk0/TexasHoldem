import {
	Injectable,
	type OnApplicationShutdown,
	type OnModuleInit,
} from "@nestjs/common";
import { EventBus } from "@nestjs/cqrs";
import { Clock } from "@/shared/application/clock.js";
import { EventStore } from "@/shared/application/event-store.js";
import { DeckProvider } from "../deck-provider.js";
import type { TableStreamEvent } from "../game-streams.js";
import { TableRuntime, type TableRuntimeDeps } from "./table-runtime.js";
import { TableRuntimeOptions } from "./table-runtime-options.js";

/** How often idle runtimes are looked for, at most. */
const SWEEP_EVERY_MS = 60_000;

/**
 * The runtimes of the tables this instance is running: one per table, created on its first
 * command, and dropped once idle for `idleMs` (its state is reloaded on the next command). Which
 * instance runs a table is POK-79's lease; until then each instance runs the tables it is sent.
 */
@Injectable()
export class TableRuntimeRegistry
	implements OnModuleInit, OnApplicationShutdown
{
	private readonly runtimes = new Map<string, TableRuntime>();
	private readonly deps: TableRuntimeDeps;
	private sweeper: ReturnType<typeof setInterval> | null = null;

	constructor(
		store: EventStore<TableStreamEvent>,
		decks: DeckProvider,
		eventBus: EventBus,
		private readonly options: TableRuntimeOptions,
		private readonly clock: Clock,
	) {
		this.deps = {
			store,
			decks,
			publish: (change) => eventBus.publish(change),
			options,
			now: () => clock.now().getTime(),
		};
	}

	get(tableId: string): TableRuntime {
		let runtime = this.runtimes.get(tableId);
		if (!runtime) {
			runtime = new TableRuntime(tableId, this.deps);
			this.runtimes.set(tableId, runtime);
		}
		return runtime;
	}

	/** How many tables are in memory. */
	get size(): number {
		return this.runtimes.size;
	}

	/** Drops the runtimes idle for `idleMs` or longer; answers how many. */
	evictIdle(): number {
		const now = this.clock.now().getTime();
		let evicted = 0;
		for (const [tableId, runtime] of this.runtimes) {
			if (runtime.idle && now - runtime.lastUsedAt >= this.options.idleMs) {
				void runtime.dispose();
				this.runtimes.delete(tableId);
				evicted += 1;
			}
		}
		return evicted;
	}

	onModuleInit(): void {
		this.sweeper = setInterval(
			() => this.evictIdle(),
			Math.min(this.options.idleMs, SWEEP_EVERY_MS),
		);
		// Never what keeps the process alive.
		this.sweeper.unref();
	}

	/** Lets queued commands finish, so none is cut off halfway through an append. */
	async onApplicationShutdown(): Promise<void> {
		if (this.sweeper) {
			clearInterval(this.sweeper);
		}
		const runtimes = [...this.runtimes.values()];
		this.runtimes.clear();
		await Promise.all(runtimes.map((runtime) => runtime.dispose()));
	}
}
