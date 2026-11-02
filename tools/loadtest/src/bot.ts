import { performance } from "node:perf_hooks";
import type { Ack } from "@holdem/shared";
import type {
	TableClientToServerEvents,
	TableEventsBatch,
	TableServerToClientEvents,
	TableView,
} from "@holdem/shared/realtime";
import { io, type Socket } from "socket.io-client";
import type { Player } from "./accounts.ts";
import type { Recorder } from "./stats.ts";
import { chooseAction, safeAction } from "./strategy.ts";

type TableSocket = Socket<TableServerToClientEvents, TableClientToServerEvents>;
type TableId = TableView["tableId"];

/** What the bots at one table share: the last action in flight, and when the table last moved. */
export interface TableTracker {
	lastAction: { seat: number; at: number; seen: Set<string> } | null;
	/** When the table last dealt a hand or started a turn. */
	lastProgressAt: number;
	hands: number;
}

export interface BotContext {
	readonly recorder: Recorder;
	readonly origin: string;
	readonly thinkMs: readonly [number, number];
	readonly buyIn: number;
	/** False once the run is over: disconnects are then expected. */
	readonly running: () => boolean;
	/** Where to reconnect after the instance this bot was on went away. */
	readonly fallbackUrl: () => string;
}

const ACK_TIMEOUT_MS = 10_000;

/** One player: a socket on one instance, sitting at one table, acting whenever it is their turn. */
export class Bot {
	private socket: TableSocket | null = null;
	/** The bot's tasks, one after another: a turn never waits on nor skips a rebuy. */
	private queue: Promise<void> = Promise.resolve();
	readonly player: Player;
	readonly tableId: TableId;
	readonly seat: number;
	private readonly tracker: TableTracker;
	private readonly context: BotContext;

	constructor(
		player: Player,
		tableId: string,
		seat: number,
		tracker: TableTracker,
		context: BotContext,
	) {
		this.player = player;
		this.tableId = tableId as TableId;
		this.seat = seat;
		this.tracker = tracker;
		this.context = context;
	}

	async connect(url: string): Promise<void> {
		const socket: TableSocket = io(`${url}/table`, {
			transports: ["websocket"],
			forceNew: true,
			reconnection: false,
			extraHeaders: {
				origin: this.context.origin,
				cookie: this.player.cookie,
				"x-forwarded-for": this.player.address,
			},
		});
		await new Promise<void>((resolve, reject) => {
			socket.once("connect", resolve);
			socket.once("connect_error", reject);
		});
		socket.on("events", (batch) => this.onEvents(batch));
		socket.on("disconnect", () => void this.onDisconnect());
		this.socket = socket;
	}

	/** Follows the table and takes the seat. */
	async sit(): Promise<void> {
		await this.command("join", { tableId: this.tableId, as: "player" });
		const taken = await this.command("take-seat", {
			tableId: this.tableId,
			seat: this.seat,
			buyIn: this.context.buyIn,
		});
		if (!taken.ok) {
			throw new Error(`Seat ${this.seat} refused: ${taken.error.code}`);
		}
	}

	close(): void {
		this.socket?.disconnect();
	}

	private onEvents(batch: TableEventsBatch): void {
		const now = performance.now();
		const { recorder } = this.context;
		const inFlight = this.tracker.lastAction;
		if (
			inFlight &&
			inFlight.seat !== this.seat &&
			!inFlight.seen.has(this.player.userId) &&
			batch.hand.some(
				(event) =>
					event.type === "PlayerActed" &&
					event.seat === inFlight.seat &&
					!event.auto,
			)
		) {
			inFlight.seen.add(this.player.userId);
			recorder.latency("fan-out", now - inFlight.at);
		}
		for (const event of batch.hand) {
			if (event.type === "HandStarted") {
				this.tracker.lastProgressAt = now;
				if (this.seat === 0) this.tracker.hands += 1;
			}
			if (
				event.type === "PlayerActed" &&
				event.auto &&
				event.seat === this.seat
			) {
				recorder.count("turns timed out");
			}
		}
		for (const event of batch.table) {
			if (event.type === "TurnStarted") {
				this.tracker.lastProgressAt = now;
				if (event.seat === this.seat) this.later(() => this.takeTurn());
			}
			if (
				event.type === "PlayerStatusChanged" &&
				event.seat === this.seat &&
				event.status === "sitting-out"
			) {
				this.later(() => this.comeBack());
			}
		}
	}

	private later(task: () => Promise<void>): void {
		const [min, max] = this.context.thinkMs;
		const think = min + Math.random() * (max - min);
		this.queue = this.queue
			.then(() => new Promise((resolve) => setTimeout(resolve, think)))
			.then(() => (this.context.running() ? task() : undefined))
			.catch((error: unknown) => {
				this.context.recorder.count(`bot error: ${(error as Error).message}`);
			});
	}

	/**
	 * Reads the table as it is now, then acts if the turn is still this player's. While the table
	 * moves to another instance it answers `table.unavailable` for a few seconds; the bot tries
	 * again, as a client would, so the turn is not lost to the timer.
	 */
	private async takeTurn(attempt = 0): Promise<void> {
		const view = await this.command("join", {
			tableId: this.tableId,
			as: "player",
		});
		if (!view.ok) {
			this.retryTurn(view, attempt);
			return;
		}
		const { hand } = view.data;
		if (hand.status !== "in-progress" || hand.toAct !== this.seat) {
			this.context.recorder.count("turns already gone");
			return;
		}
		if (hand.legalActions) {
			const act = async (choice: ReturnType<typeof chooseAction>) => {
				this.tracker.lastAction = {
					seat: this.seat,
					at: performance.now(),
					seen: new Set(),
				};
				const ack = await this.command(
					"act",
					{ tableId: this.tableId, ...choice },
					"act",
				);
				if (!ack.ok) this.tracker.lastAction = null;
				return ack;
			};
			const acted = await act(chooseAction(hand.legalActions));
			if (!acted.ok && this.retryTurn(acted, attempt)) return;
			// A refused choice is the bot's mistake, counted; the turn goes on with a safe move.
			if (!acted.ok) await act(safeAction(hand.legalActions));
		} else {
			await this.command("muck-cards", { tableId: this.tableId }, "act");
		}
	}

	/** Takes the turn again later after a transient refusal; answers whether it will. */
	private retryTurn(ack: Ack<unknown>, attempt: number): boolean {
		const transient =
			!ack.ok &&
			["table.unavailable", "bot.no-ack", "bot.disconnected"].includes(
				ack.error.code,
			);
		if (!transient || attempt >= 30) return false;
		this.later(() => this.takeTurn(attempt + 1));
		return true;
	}

	/** Sat out: busted players buy in again, then everyone sits back in. */
	private async comeBack(): Promise<void> {
		const view = await this.command("join", {
			tableId: this.tableId,
			as: "player",
		});
		if (!view.ok) return;
		const me = view.data.seats.find(({ seat }) => seat === this.seat);
		if (!me) return;
		if (me.stack === 0) {
			this.context.recorder.count("rebuys");
			await this.command("rebuy", {
				tableId: this.tableId,
				amount: this.context.buyIn,
			});
		}
		await this.command("sit-in", { tableId: this.tableId });
	}

	/** The instance went away (`--chaos`): the bot comes back through the other one. */
	private async onDisconnect(): Promise<void> {
		if (!this.context.running()) return;
		const { recorder } = this.context;
		recorder.count("disconnects");
		const startedAt = performance.now();
		for (let attempt = 0; attempt < 20 && this.context.running(); attempt++) {
			await new Promise((resolve) => setTimeout(resolve, 500));
			try {
				// Once connected, only the join is tried again: a second socket would get every
				// event twice.
				if (!this.socket?.connected) {
					await this.connect(this.context.fallbackUrl());
				}
				const joined = await this.command("join", {
					tableId: this.tableId,
					as: "player",
				});
				if (joined.ok) {
					recorder.latency("reconnect", performance.now() - startedAt);
					// A turn that started while the bot was away is in the snapshot only.
					const { hand } = joined.data;
					if (hand.status === "in-progress" && hand.toAct === this.seat) {
						this.later(() => this.takeTurn());
					}
					return;
				}
			} catch {
				// The other instance may still be taking the table over; try again.
			}
		}
		recorder.count("bots lost");
	}

	/** Sends a command and waits for its ack; `metric` records how long that took. */
	private async command(
		event: keyof TableClientToServerEvents,
		payload: { readonly tableId: TableId; readonly [field: string]: unknown },
		metric = event === "join" ? "view" : "command",
	): Promise<Ack<TableView>> {
		const socket = this.socket;
		if (!socket?.connected) {
			return {
				ok: false,
				error: { code: "bot.disconnected" },
			} as Ack<TableView>;
		}
		const started = performance.now();
		try {
			// The contract types each event's payload; the bot builds them by hand, as a client would.
			const ack = (await (socket as Socket)
				.timeout(ACK_TIMEOUT_MS)
				.emitWithAck(event, payload)) as Ack<TableView>;
			this.context.recorder.latency(metric, performance.now() - started);
			if (!ack.ok) this.context.recorder.count(`refused: ${ack.error.code}`);
			return ack;
		} catch {
			this.context.recorder.count(`no ack: ${event}`);
			return { ok: false, error: { code: "bot.no-ack" } } as Ack<TableView>;
		}
	}
}
