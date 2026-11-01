import { randomUUID } from "node:crypto";
import { Logger } from "@nestjs/common";
import {
	ConcurrencyError,
	type EventMetadata,
	type EventStore,
} from "@/shared/application/event-store.js";
import {
	decideGame,
	type GameEvents,
	type GameState,
	handReady,
} from "../../domain/game.js";
import type { GameCommand } from "../../domain/table-commands.js";
import type { TableCommandInput } from "../commands/execute-table-command/execute-table-command.command.js";
import type { DeckProvider } from "../deck-provider.js";
import { TableChanged } from "../events/table-changed.event.js";
import {
	type LoadedGame,
	loadGame,
	saveGame,
	type TableStreamEvent,
} from "../game-streams.js";
import type { TableRuntimeOptions } from "./table-runtime-options.js";

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
 * the runtime reloads and decides once more. It also deals the next hand after the pause.
 */
export class TableRuntime {
	private readonly logger = new Logger(TableRuntime.name);
	private loaded: LoadedGame | null = null;
	private tail: Promise<unknown> = Promise.resolve();
	private pending = 0;
	private nextHand: ReturnType<typeof setTimeout> | null = null;
	private disposed = false;
	private usedAt: number;

	constructor(
		readonly tableId: string,
		private readonly deps: TableRuntimeDeps,
	) {
		this.usedAt = deps.now();
	}

	/** No command is queued or running, and no deal is due. */
	get idle(): boolean {
		return this.pending === 0 && this.nextHand === null;
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
				const { deck, buttonDraw } = await this.deps.decks.deal(handId);
				return { type: "StartHand", handId, deck, buttonDraw };
			}),
		);
	}

	/** Stops dealing hands and answers once the queued commands have run. */
	async dispose(): Promise<void> {
		this.disposed = true;
		this.cancelNextHand();
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
		this.loaded ??= await loadGame(this.deps.store, this.tableId);
		const loaded = this.loaded;
		const command = await commandFor(loaded.state);
		if (!command) {
			return null;
		}
		const decision = decideGame(command, loaded.state);
		if (!decision.ok) {
			throw decision.error;
		}
		let saved: LoadedGame;
		try {
			saved = await saveGame(this.deps.store, loaded, decision.value, metadata);
		} catch (error) {
			// The stored streams are ahead of, or no longer match, the state in memory.
			this.loaded = null;
			if (error instanceof ConcurrencyError && retry) {
				return this.run(commandFor, metadata, false);
			}
			throw error;
		}
		this.loaded = saved;
		this.deps.publish(
			new TableChanged(
				this.tableId,
				saved.tableVersion,
				decision.value,
				saved.state,
			),
		);
		this.scheduleNextHand(saved.state);
		return decision.value;
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
