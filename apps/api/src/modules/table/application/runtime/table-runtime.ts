import { randomUUID } from "node:crypto";
import { Logger } from "@nestjs/common";
import {
	ConcurrencyError,
	type EventMetadata,
	type EventStore,
	FencedError,
} from "@/shared/application/event-store.js";
import {
	absenceDueAt,
	decideGame,
	type GameEvents,
	type GameState,
	handReady,
	turnDueAt,
} from "../../domain/game.js";
import {
	AbsenceNotDueError,
	NoHandError,
	TimeoutNotDueError,
} from "../../domain/table-errors.js";
import type { GameCommand } from "../../domain/table-commands.js";
import type { TableCommandInput } from "../commands/execute-table-command/execute-table-command.command.js";
import type { DeckProvider } from "../deck-provider.js";
import { TableChanged } from "../events/table-changed.event.js";
import {
	type LoadedGame,
	loadGame,
	saveGame,
	type TableStreamEvent,
	versionsOf,
} from "../game-streams.js";
import type { TableRuntimeOptions } from "./table-runtime-options.js";
import { TableMovedError } from "./table-routing-errors.js";

/** What one runtime holds of its table's lease (ADR-004). */
export interface RuntimeLease {
	/** Stored with every event it appends, so a newer holder fences it off. */
	readonly epoch: number;
	/** Called once the runtime finds the table written by a newer holder, and stops. */
	readonly onLost: () => void;
}

export interface TableRuntimeDeps {
	readonly store: EventStore<TableStreamEvent>;
	readonly decks: DeckProvider;
	readonly publish: (change: TableChanged) => void;
	readonly options: TableRuntimeOptions;
	readonly now: () => number;
}

/** The command a piece of work sends, decided from the current state; null to send none. */
type CommandFor = (state: GameState) => Promise<GameCommand | null>;

/**
 * One table in memory (ADR-002): a mailbox runs its commands one at a time, in the order they
 * came, over the state folded once from its streams, so commands for a table never interleave.
 * Each decision is appended with the version it was made on; when another writer got there first,
 * the runtime reloads and decides once more. It also deals the next hand after the pause, times
 * each turn out once its time and the player's time bank are spent (POK-84), reveals each hand's
 * server seed once it has ended (POK-86), and applies the absence policy once a reconnect grace or
 * a sit-out runs out (POK-85).
 */
export class TableRuntime {
	private readonly logger = new Logger(TableRuntime.name);
	private loaded: LoadedGame | null = null;
	private tail: Promise<unknown> = Promise.resolve();
	private pending = 0;
	private nextHand: ReturnType<typeof setTimeout> | null = null;
	private turnTimer: ReturnType<typeof setTimeout> | null = null;
	private absenceTimer: ReturnType<typeof setTimeout> | null = null;
	private disposed = false;
	private lost = false;
	private usedAt: number;

	constructor(
		readonly tableId: string,
		private readonly deps: TableRuntimeDeps,
		/** Without one (tests), appends are not fenced. */
		readonly lease: RuntimeLease | null = null,
	) {
		this.usedAt = deps.now();
	}

	/** No command is queued or running, and no deal, timeout or absence is due. */
	get idle(): boolean {
		return (
			this.pending === 0 &&
			this.nextHand === null &&
			this.turnTimer === null &&
			this.absenceTimer === null
		);
	}

	/** The table is closed: it takes no more commands, and need not stay in memory. */
	get closed(): boolean {
		return this.loaded?.state.table.status === "closed";
	}

	/** When the table last took or finished a command. */
	get lastUsedAt(): number {
		return this.usedAt;
	}

	/** Queues a command; answers the events it added, or throws the rule it broke. */
	execute(
		command: TableCommandInput,
		metadata?: EventMetadata,
	): Promise<GameEvents> {
		return this.enqueue(
			async () => (await this.run(async () => command, metadata)) as GameEvents,
		);
	}

	/** Queues the deal of the next hand; answers null when the table cannot start one now. */
	dealNextHand(): Promise<GameEvents | null> {
		return this.enqueue(() =>
			this.run(async (state) => {
				if (!handReady(state.table)) {
					return null;
				}
				const handId = randomUUID();
				const { deck, buttonDraw, commitment } = await this.deps.decks.deal(
					this.tableId,
					handId,
				);
				return { type: "StartHand", handId, deck, buttonDraw, commitment };
			}),
		);
	}

	/** The table as it is once the commands queued before have run; loads it if need be. */
	view(): Promise<LoadedGame> {
		return this.enqueue(() => this.load());
	}

	/**
	 * Takes the table up from its streams as loaded when the lease was acquired, and arms what is
	 * due: the next deal, the turn timer, the absence timer. A table taken over from an instance that
	 * stopped carries on from where its streams are (POK-80).
	 */
	resume(loaded: LoadedGame): void {
		if (this.disposed || this.loaded) {
			return;
		}
		this.loaded = loaded;
		this.armTimers(loaded.state);
	}

	/**
	 * Stops at once, without waiting for queued work, which is refused: a newer holder of the lease
	 * runs the table now. The state in memory is dropped.
	 */
	abandon(): void {
		if (this.lost) {
			return;
		}
		this.lost = true;
		this.disposed = true;
		this.loaded = null;
		this.cancelNextHand();
		this.cancelTurnTimer();
		this.cancelAbsenceTimer();
		this.lease?.onLost();
	}

	/** Stops dealing hands and answers once the queued commands have run. */
	async dispose(): Promise<void> {
		this.disposed = true;
		this.cancelNextHand();
		this.cancelTurnTimer();
		this.cancelAbsenceTimer();
		await this.tail;
	}

	private enqueue<T>(work: () => Promise<T>): Promise<T> {
		if (this.disposed) {
			return Promise.reject(
				new Error(`Table ${this.tableId} is no longer running here`),
			);
		}
		this.pending += 1;
		this.usedAt = this.deps.now();
		const run = this.tail.then(work).finally(() => {
			this.pending -= 1;
			this.usedAt = this.deps.now();
		});
		this.tail = run.catch(() => undefined);
		return run;
	}

	private async run(
		commandFor: CommandFor,
		metadata?: EventMetadata,
		retry = true,
	): Promise<GameEvents | null> {
		if (this.lost) {
			throw new TableMovedError(this.tableId);
		}
		const loaded = await this.load();
		const command = await commandFor(loaded.state);
		if (!command) {
			return null;
		}
		const decision = decideGame(command, loaded.state, this.deps.now());
		if (!decision.ok) {
			throw decision.error;
		}
		let saved: LoadedGame;
		try {
			saved = await saveGame(this.deps.store, loaded, decision.value, {
				...metadata,
				...(this.lease && { leaseEpoch: this.lease.epoch }),
			});
		} catch (error) {
			// The stored streams are ahead of, or no longer match, the state in memory.
			this.loaded = null;
			if (error instanceof FencedError) {
				this.abandon();
				throw new TableMovedError(this.tableId);
			}
			if (error instanceof ConcurrencyError && retry) {
				return this.run(commandFor, metadata, false);
			}
			throw error;
		}
		this.loaded = saved;
		this.deps.publish(
			new TableChanged(
				this.tableId,
				versionsOf(saved),
				decision.value,
				saved.state,
			),
		);
		this.armTimers(saved.state);
		for (const event of decision.value.table) {
			if (event.type === "HandSettled") {
				this.revealDeck(event.handId);
			}
		}
		return decision.value;
	}

	/**
	 * Publishes an ended hand's server seed, right after the command that ended it and before the
	 * next deal: everyone can then check the deal against the commitment (ADR-008).
	 */
	private revealDeck(handId: string): void {
		if (this.disposed) {
			return;
		}
		this.enqueue(() =>
			this.run(async () => {
				const serverSeed = await this.deps.decks.reveal(handId);
				return serverSeed ? { type: "RevealDeck", handId, serverSeed } : null;
			}),
		).catch((error: unknown) => {
			this.logger.error({
				msg: "deck not revealed",
				tableId: this.tableId,
				handId,
				err: error,
			});
		});
	}

	/** The state in memory, folded from the streams first if need be; arms the timers it needs. */
	private async load(): Promise<LoadedGame> {
		if (!this.loaded) {
			this.loaded = await loadGame(this.deps.store, this.tableId);
			this.armTimers(this.loaded.state);
		}
		return this.loaded;
	}

	/** Whatever the state has due next: the deal, the turn's timeout, an absence. */
	private armTimers(state: GameState): void {
		this.scheduleNextHand(state);
		this.armTurnTimer(state);
		this.armAbsenceTimer(state);
	}

	/**
	 * Times out the player to act once their turn time and time bank are spent, in the mailbox
	 * like any command. The timer is set again after every change, so it always follows the current
	 * turn; the table also refuses a timeout that is not due, should an old one still fire.
	 */
	private armTurnTimer(state: GameState): void {
		this.cancelTurnTimer();
		const dueAt = turnDueAt(state.table);
		const { turn } =
			state.table.status === "unopened" ? { turn: null } : state.table;
		if (this.disposed || dueAt === null || !turn) {
			return;
		}
		const { handId, seat } = turn;
		this.turnTimer = setTimeout(
			() => {
				this.turnTimer = null;
				this.enqueue(() =>
					this.run(async () => ({ type: "Timeout", handId, seat })),
				).catch((error: unknown) => {
					// A turn that ended meanwhile, or a timer that fired early: set it again from what
					// the table is now, or it would never fire for this turn.
					if (
						error instanceof TimeoutNotDueError ||
						error instanceof NoHandError
					) {
						this.rearm();
						return;
					}
					this.logger.error({
						msg: "turn not timed out",
						tableId: this.tableId,
						err: error,
					});
				});
			},
			Math.max(0, dueAt - this.deps.now()),
		);
	}

	private cancelTurnTimer(): void {
		if (this.turnTimer) {
			clearTimeout(this.turnTimer);
			this.turnTimer = null;
		}
	}

	/**
	 * Applies the absence policy once the next reconnect grace or sit-out runs out, like the turn
	 * timer: set again after every change, and an early or stale one is refused by the table.
	 */
	private armAbsenceTimer(state: GameState): void {
		this.cancelAbsenceTimer();
		const dueAt = absenceDueAt(state.table);
		if (this.disposed || dueAt === null) {
			return;
		}
		this.absenceTimer = setTimeout(
			() => {
				this.absenceTimer = null;
				this.enqueue(() =>
					this.run(async () => ({ type: "ExpireAbsences" })),
				).catch((error: unknown) => {
					if (error instanceof AbsenceNotDueError) {
						this.rearm();
						return;
					}
					this.logger.error({
						msg: "absences not expired",
						tableId: this.tableId,
						err: error,
					});
				});
			},
			Math.max(0, dueAt - this.deps.now()),
		);
	}

	/**
	 * Sets the timers again after one the table refused: it fired a moment early, or the state in
	 * memory is behind the streams. Reloading first, so a timer never fires again and again on a
	 * stale state.
	 */
	private rearm(): void {
		if (this.disposed) {
			return;
		}
		this.enqueue(async () => {
			this.loaded = null;
			await this.load();
		}).catch((error: unknown) => {
			this.logger.error({
				msg: "table not reloaded",
				tableId: this.tableId,
				err: error,
			});
		});
	}

	private cancelAbsenceTimer(): void {
		if (this.absenceTimer) {
			clearTimeout(this.absenceTimer);
			this.absenceTimer = null;
		}
	}

	/** A hand ended, or a player got ready: the next hand comes after the pause. */
	private scheduleNextHand(state: GameState): void {
		if (this.disposed || this.nextHand || !handReady(state.table)) {
			return;
		}
		this.nextHand = setTimeout(() => {
			this.nextHand = null;
			this.dealNextHand().catch((error: unknown) => {
				this.logger.error({
					msg: "next hand not dealt",
					tableId: this.tableId,
					err: error,
				});
			});
		}, this.deps.options.handPauseMs);
	}

	private cancelNextHand(): void {
		if (this.nextHand) {
			clearTimeout(this.nextHand);
			this.nextHand = null;
		}
	}
}
