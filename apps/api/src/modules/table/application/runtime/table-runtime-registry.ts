import type { TableView } from "@holdem/shared/realtime";
import {
	Injectable,
	Logger,
	type OnApplicationBootstrap,
	type OnApplicationShutdown,
} from "@nestjs/common";
import { EventBus } from "@nestjs/cqrs";
import { Clock } from "@/shared/application/clock.js";
import {
	type EventMetadata,
	EventStore,
} from "@/shared/application/event-store.js";
import type { TableCommandInput } from "../commands/execute-table-command/execute-table-command.command.js";
import { DeckProvider } from "../deck-provider.js";
import {
	type LoadedGame,
	loadGame,
	type TableStreamEvent,
	tableStream,
	versionsOf,
} from "../game-streams.js";
import { type TableLease, TableLeases } from "../table-leases.js";
import {
	type TableReplies,
	type TableRequest,
	TableRequests,
} from "../table-requests.js";
import { tableViewFor, viewerAt } from "../table-views.js";
import { UnfinishedTables } from "../unfinished-tables.js";
import { TableNotOpenError } from "../../domain/table-errors.js";
import { TableRuntime, type TableRuntimeDeps } from "./table-runtime.js";
import { TableRuntimeOptions } from "./table-runtime-options.js";
import {
	TableMovedError,
	TableUnavailableError,
} from "./table-routing-errors.js";

/** How often idle runtimes are looked for, at most. */
const SWEEP_EVERY_MS = 60_000;

interface Running {
	readonly runtime: TableRuntime;
	readonly lease: TableLease;
}

/**
 * Runs each table on the one instance holding its lease (ADR-004), and sends what other
 * instances are asked for a table to that one:
 *
 * - The first command for a table nobody holds takes its lease here: its streams are folded into a
 *   `TableRuntime`, which arms whatever is due. The lease is renewed every third of its time to
 *   live; a renewal Redis answers with "not yours" stops the runtime at once.
 * - A command for a table another instance holds is sent there (`TableRequests`), and the answer
 *   comes back; if the table moved meanwhile, it is sent once more to its new holder.
 * - A runtime idle for `idleMs` is dropped and its lease released; so are all of them on shutdown,
 *   so another instance can take them at once.
 * - Tables whose holder stopped without releasing them are taken over once their lease runs out,
 *   as are tables with a hand left unfinished when the api starts (POK-80).
 */
@Injectable()
export class TableRuntimeRegistry
	implements OnApplicationBootstrap, OnApplicationShutdown
{
	private readonly logger = new Logger(TableRuntimeRegistry.name);
	private readonly running = new Map<string, Running>();
	/** Leases being taken, so two commands for one table take it once. */
	private readonly starting = new Map<string, Promise<Running | null>>();
	private readonly deps: TableRuntimeDeps;
	private readonly timers: ReturnType<typeof setInterval>[] = [];
	private renewalsFailing = false;
	private stopped = false;

	constructor(
		private readonly store: EventStore<TableStreamEvent>,
		decks: DeckProvider,
		eventBus: EventBus,
		private readonly options: TableRuntimeOptions,
		private readonly clock: Clock,
		private readonly leases: TableLeases,
		private readonly requests: TableRequests,
		private readonly unfinished: UnfinishedTables,
	) {
		this.deps = {
			store,
			decks,
			publish: (change) => eventBus.publish(change),
			options,
			now: () => clock.now().getTime(),
		};
	}

	/** Runs a command on the table, wherever it runs. */
	async execute(
		tableId: string,
		command: TableCommandInput,
		metadata: EventMetadata = {},
	): Promise<void> {
		await this.route({ kind: "execute", tableId, command, metadata });
	}

	/** Deals the table's next hand if it can start now; answers whether it did. */
	dealNextHand(tableId: string): Promise<boolean> {
		return this.route({ kind: "deal", tableId });
	}

	/** The table as this user sees it, after the commands queued before. */
	viewFor(tableId: string, userId: string): Promise<TableView> {
		return this.route({ kind: "view", tableId, userId });
	}

	/** How many tables run here. */
	get size(): number {
		return this.running.size;
	}

	/** Drops the runtimes idle for `idleMs` or longer, releasing their leases; answers how many. */
	evictIdle(): number {
		const now = this.clock.now().getTime();
		let evicted = 0;
		for (const [tableId, { runtime, lease }] of this.running) {
			if (runtime.idle && now - runtime.lastUsedAt >= this.options.idleMs) {
				this.running.delete(tableId);
				void runtime.dispose().then(() => this.leases.release(lease));
				evicted += 1;
			}
		}
		return evicted;
	}

	/**
	 * Renews every lease held here. One Redis says is gone stops its runtime; while Redis does not
	 * answer, runtimes go on: no other instance can take a table over meanwhile either.
	 */
	async renewLeases(): Promise<void> {
		await Promise.all(
			[...this.running.values()].map(async ({ runtime, lease }) => {
				try {
					if (!(await this.leases.renew(lease))) {
						this.logger.warn({
							msg: "table lease lost",
							tableId: lease.tableId,
							epoch: lease.epoch,
						});
						runtime.abandon();
					}
					this.renewalsFailing = false;
				} catch (error) {
					if (!this.renewalsFailing) {
						this.renewalsFailing = true;
						this.logger.warn({
							msg: "table leases not renewed; tables go on running here",
							err: error,
						});
					}
				}
			}),
		);
	}

	/** Takes over the tables whose holder stopped, and those with a hand left unfinished. */
	async adoptOrphans(alsoUnfinished = false): Promise<void> {
		const orphans = new Set(await this.leases.orphans());
		if (alsoUnfinished) {
			for (const tableId of await this.unfinished.list()) {
				orphans.add(tableId);
			}
		}
		for (const tableId of orphans) {
			if (this.stopped) {
				return;
			}
			if (!this.running.has(tableId)) {
				await this.take(tableId, true).catch((error: unknown) => {
					this.logger.error({
						msg: "table not taken over",
						tableId,
						err: error,
					});
				});
			}
		}
	}

	onApplicationBootstrap(): void {
		this.requests.serve((request) => this.serve(request));
		const { leaseTtlMs, idleMs } = this.options;
		const every = (ms: number, work: () => unknown) => {
			const timer = setInterval(work, ms);
			// Never what keeps the process alive.
			timer.unref();
			this.timers.push(timer);
		};
		every(Math.min(idleMs, SWEEP_EVERY_MS), () => this.evictIdle());
		every(leaseTtlMs / 3, () => void this.renewLeases());
		every(
			leaseTtlMs,
			() => void this.adoptOrphans().catch(this.logFailedSweep),
		);
		// After a start, some time apart from the other instances that start with it.
		const startup = setTimeout(
			() => void this.adoptOrphans(true).catch(this.logFailedSweep),
			Math.random() * (leaseTtlMs / 2),
		);
		startup.unref();
		this.timers.push(startup);
	}

	/** Lets queued commands finish, so none is cut off halfway through an append; then lets go. */
	async onApplicationShutdown(): Promise<void> {
		this.stopped = true;
		for (const timer of this.timers) {
			clearInterval(timer);
		}
		const running = [...this.running.values()];
		this.running.clear();
		await Promise.all(
			running.map(async ({ runtime, lease }) => {
				await runtime.dispose();
				await this.leases.release(lease).catch(() => undefined);
			}),
		);
	}

	private readonly logFailedSweep = (error: unknown) => {
		this.logger.error({ msg: "orphan tables not looked for", err: error });
	};

	/** Runs the request here if the table runs here or can; otherwise sends it to its holder. */
	private async route<R extends TableRequest>(
		request: R,
	): Promise<TableReplies[R["kind"]]> {
		for (let attempt = 0; ; attempt++) {
			try {
				const local = await this.local(request.tableId);
				if (local) {
					return await this.run(local, request);
				}
				const owner = await this.leases.ownerOf(request.tableId);
				if (owner === null) {
					// Released just now: take it on the next attempt.
					throw new TableMovedError(request.tableId);
				}
				return await this.requests.send(owner, request);
			} catch (error) {
				if (!(error instanceof TableMovedError) || attempt >= 1) {
					throw error;
				}
			}
		}
	}

	/** Another instance's request: served here only while the table runs here. */
	private async serve(
		request: TableRequest,
	): Promise<TableReplies[TableRequest["kind"]]> {
		const local = await this.local(request.tableId);
		if (!local) {
			throw new TableMovedError(request.tableId);
		}
		return this.run(local, request);
	}

	private async run<R extends TableRequest>(
		runtime: TableRuntime,
		request: R,
	): Promise<TableReplies[R["kind"]]> {
		type Reply = TableReplies[R["kind"]];
		switch (request.kind) {
			case "execute":
				await runtime.execute(request.command, request.metadata);
				return undefined as Reply;
			case "deal":
				return ((await runtime.dealNextHand()) !== null) as Reply;
			case "view":
				return this.viewOf(await runtime.view(), request.userId) as Reply;
		}
	}

	private viewOf(loaded: LoadedGame, userId: string): TableView {
		const { table } = loaded.state;
		if (table.status === "unopened") {
			throw new TableNotOpenError();
		}
		return tableViewFor(
			loaded.state,
			versionsOf(loaded),
			viewerAt(table, userId),
			this.clock.now(),
		);
	}

	/**
	 * The table's runtime here, taking its lease if nobody holds it; null if another instance does.
	 * `take` is only called for a table not running here.
	 */
	private async local(tableId: string): Promise<TableRuntime | null> {
		const running = this.running.get(tableId) ?? (await this.take(tableId));
		return running?.runtime ?? null;
	}

	/** Takes the table's lease and starts its runtime; null when another instance holds it. */
	private take(tableId: string, takeover = false): Promise<Running | null> {
		let starting = this.starting.get(tableId);
		if (!starting) {
			starting = this.start(tableId, takeover).finally(() =>
				this.starting.delete(tableId),
			);
			this.starting.set(tableId, starting);
		}
		return starting;
	}

	private async start(
		tableId: string,
		takeover: boolean,
	): Promise<Running | null> {
		if (this.stopped) {
			throw new TableUnavailableError(tableId);
		}
		const owner = await this.leases.ownerOf(tableId);
		// A lease of this instance's without a runtime is a stale one: it is taken again.
		if (owner !== null && owner !== this.leases.instanceId) {
			return null;
		}
		const startedAt = this.clock.now().getTime();
		// Read before the lease is taken, for the epoch it must go past; a write in between makes the
		// first append conflict, and the runtime reloads.
		const loaded = await loadGame(this.store, tableId);
		const lease = await this.leases.acquire(tableId, loaded.leaseEpoch);
		if (!lease) {
			return null;
		}
		const runtime = new TableRuntime(tableId, this.deps, {
			epoch: lease.epoch,
			onLost: () => {
				if (this.running.get(tableId)?.runtime === runtime) {
					this.running.delete(tableId);
				}
			},
		});
		const running = { runtime, lease };
		this.running.set(tableId, running);
		runtime.resume(loaded);
		if (takeover) {
			await this.logTakeover(tableId, lease, startedAt);
		}
		return running;
	}

	/** How long the table went without its holder, as far as its streams tell. */
	private async logTakeover(
		tableId: string,
		lease: TableLease,
		startedAt: number,
	): Promise<void> {
		const now = this.clock.now().getTime();
		const last = (await this.store.readStream(tableStream(tableId))).at(-1);
		this.logger.log({
			msg: "table taken over",
			tableId,
			epoch: lease.epoch,
			sinceLastEventMs: last ? now - last.occurredAt.getTime() : null,
			takeOverMs: now - startedAt,
		});
	}
}
