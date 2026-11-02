import {
	commitServerSeed,
	decide as decideHand,
	evolve as evolveHand,
	firstHandPositions,
	type HandCommand,
	type HandEvent,
	type HandPositions,
	type HandState,
	hexToBytes,
	initialHandState,
	legalActions,
	nextHandPositions,
} from "@holdem/engine";
import { err, ok, type Result } from "@/shared/domain/result.js";
import { decideTable } from "./decide-table.js";
import { evolveTable } from "./evolve-table.js";
import type {
	AbsenceCommand,
	ForceCloseCommand,
	GameCommand,
	HandPlayCommand,
	TableCommand,
} from "./table-commands.js";
import {
	AbsenceNotDueError,
	AlreadyDisconnectedError,
	HandInProgressError,
	HandRuleError,
	LeavingSeatError,
	NoHandError,
	NotEnoughPlayersError,
	NotDisconnectedError,
	NotInHandError,
	NotSeatedError,
	type TableError,
	TableClosedError,
	TableNotOpenError,
	TimeoutNotDueError,
	DeckMismatchError,
} from "./table-errors.js";
import type { TableEvent } from "./table-events.js";
import type { OpenedTable, SeatedPlayer, TableState } from "./table-state.js";

/**
 * A table and the hand it is running, decided together: the table is the only caller of the hand
 * decider (Context Map). Each lives in its own stream: `table-<tableId>` and `hand-<handId>`.
 */
export interface GameState {
	readonly table: TableState;
	/** The running hand, or the last one until the next starts; idle before the first. */
	readonly hand: HandState;
}

/** What one command adds to each stream. */
export interface GameEvents {
	readonly table: readonly TableEvent[];
	readonly hand: readonly HandEvent[];
}

export type GameDecision = Result<GameEvents, TableError>;

export const initialGameState: GameState = {
	table: { status: "unopened" },
	hand: initialHandState,
};

/** Commands decided here, with the hand and the clock; the rest go to the table decider. */
const GAME_COMMANDS: ReadonlySet<GameCommand["type"]> = new Set([
	"StartHand",
	"Act",
	"ShowCards",
	"MuckCards",
	"Timeout",
	"RevealDeck",
	"Disconnect",
	"Reconnect",
	"ExpireAbsences",
	"ForceCloseTable",
]);

const isTableCommand = (command: GameCommand): command is TableCommand =>
	!GAME_COMMANDS.has(command.type);

/** Players who can be dealt in: neither sitting out nor leaving. Busted players sit out. */
const ready = (table: OpenedTable): SeatedPlayer[] =>
	table.players.filter(
		({ status }) => status === "active" || status === "waiting-for-big-blind",
	);

/**
 * Where the button and the blinds go, and who is dealt in: the dead button rule from the last hand
 * (RULES §4), or a fresh start with the button drawn among the players ready (RULES §3), before
 * the first hand and whenever the rule leaves fewer than two to deal in. Null with fewer than two.
 */
function positionsFor(
	table: OpenedTable,
	buttonDraw: number,
): HandPositions | null {
	const players = ready(table);
	const seated = players.map(({ seat, status }) => ({
		seat,
		waiting: status === "waiting-for-big-blind",
	}));
	const next = table.positions && nextHandPositions(table.positions, seated);
	if (next) {
		return next;
	}
	const seats = players.map(({ seat }) => seat);
	const button =
		seats[Math.abs(Math.trunc(buttonDraw)) % Math.max(seats.length, 1)];
	return button === undefined ? null : firstHandPositions(seats, button);
}

/** Whether a hand can start now: the table is open, idle, and has two players ready. */
export function handReady(table: TableState): boolean {
	return (
		table.status === "open" && !table.hand && positionsFor(table, 0) !== null
	);
}

/** Collects the events of one command while keeping both states up to date. */
class Game {
	readonly events: { table: TableEvent[]; hand: HandEvent[] } = {
		table: [],
		hand: [],
	};

	constructor(
		public table: TableState,
		public hand: HandState,
		/** When the command is taken, in epoch milliseconds: the turn clock runs on it. */
		readonly now: number,
	) {}

	addTable(events: readonly TableEvent[]): void {
		this.events.table.push(...events);
		this.table = events.reduce(evolveTable, this.table);
	}

	/** Sends a command to the hand; its refusal is the command's. */
	play(command: HandCommand): Result<void, TableError> {
		const decision = decideHand(command, this.hand);
		if (!decision.ok) {
			return err(new HandRuleError(decision.error));
		}
		this.events.hand.push(...decision.events);
		this.hand = decision.events.reduce(evolveHand, this.hand);
		return ok(undefined);
	}

	/**
	 * What follows on its own: a player who is leaving folds on their turn (mucks at the showdown),
	 * and an ended hand is settled. Settling sets every stack, lets the leaving players go and sits
	 * out the busted ones, who rebuy to play on.
	 */
	settle(): void {
		for (;;) {
			const { table, hand } = this;
			if (table.status === "unopened" || hand.status === "idle") {
				return;
			}
			const leaving = table.players.find(
				({ seat, status }) => seat === hand.toAct && status === "leaving",
			);
			if (hand.status === "in-progress" && leaving) {
				const folded = this.play(
					legalActions(hand, leaving.seat)
						? { type: "Act", seat: leaving.seat, action: "fold" }
						: { type: "MuckCards", seat: leaving.seat },
				);
				// Folding or mucking is always allowed on one's turn.
				if (!folded.ok) throw folded.error;
				continue;
			}
			if (hand.status !== "ended" || table.hand?.handId !== hand.handId) {
				return;
			}
			const ended = this.events.hand.findLast(
				(event) => event.type === "HandEnded" || event.type === "HandCancelled",
			);
			const stacks =
				ended?.type === "HandEnded" || ended?.type === "HandCancelled"
					? ended.stacks
					: [];
			this.addTable([
				{ type: "HandSettled", v: 1, handId: hand.handId, stacks: [...stacks] },
			]);
			const settled = this.table as OpenedTable;
			this.addTable(
				settled.players.flatMap(
					({ seat, userId, stack, status }): TableEvent[] => {
						if (status === "leaving") {
							return [{ type: "SeatLeft", v: 1, seat, userId }];
						}
						return stack === 0 && status !== "sitting-out"
							? [
									{
										type: "PlayerStatusChanged",
										v: 1,
										seat,
										status: "sitting-out",
									},
								]
							: [];
					},
				),
			);
		}
	}

	/**
	 * The absence policy (POK-85), at the game's time: a disconnected player whose reconnect grace
	 * is over sits out, and one who has sat out for the table's `sitOutSeconds`, or `sitOutHands`
	 * hands, leaves the seat, keeping it until the end of a hand they are still in. Answers whether
	 * anything was due.
	 */
	expireAbsences(): boolean {
		const { table } = this;
		if (table.status !== "open") return false;
		const { config } = table;
		const before = this.events.table.length;
		for (const { userId, status, disconnectedAt, sitOut } of table.players) {
			const graceOver =
				disconnectedAt !== null &&
				this.now >= disconnectedAt + config.reconnectGraceSeconds * 1000;
			const sitOutOver =
				sitOut !== null &&
				(this.now >= sitOut.since + config.sitOutSeconds * 1000 ||
					sitOut.handsMissed >= config.sitOutHands);
			const command: TableCommand | null =
				status === "sitting-out"
					? sitOutOver
						? { type: "LeaveSeat", userId }
						: null
					: status !== "leaving" && graceOver
						? { type: "SitOut", userId }
						: null;
			if (command) {
				const decision = decideTable(command, this.table);
				// The player is seated and not leaving, which is all either command needs.
				if (!decision.ok) throw decision.error;
				this.addTable(decision.value);
			}
		}
		return this.events.table.length > before;
	}

	/** Starts the sit-out clock of every player who has just started sitting out. */
	startSitOutClocks(): void {
		const { table } = this;
		if (table.status !== "open") return;
		this.addTable(
			table.players
				.filter(({ status, sitOut }) => status === "sitting-out" && !sitOut)
				.map(({ seat }): TableEvent => ({
					type: "SitOutStarted",
					v: 1,
					seat,
					at: this.now,
				})),
		);
	}
}

/** When the turn's own time is out; the time bank runs from then. */
const turnEndsAt = (table: OpenedTable, startedAt: number) =>
	startedAt + table.config.turnSeconds * 1000;

/**
 * When the player to act runs out of time altogether, bank included; null without a timed turn.
 * A disconnected player's turn is cut to `disconnectedTurnSeconds` from its start, or from the
 * disconnect if later, so the table is not held up waiting for them (POK-85).
 */
export function turnDueAt(table: TableState): number | null {
	if (table.status !== "open" || !table.turn) return null;
	const { seat, startedAt } = table.turn;
	const player = table.players.find((candidate) => candidate.seat === seat);
	const dueAt = turnEndsAt(table, startedAt) + (player?.timeBankMs ?? 0);
	if (player?.disconnectedAt == null) return dueAt;
	const away = Math.max(startedAt, player.disconnectedAt);
	return Math.min(dueAt, away + table.config.disconnectedTurnSeconds * 1000);
}

/**
 * When the next reconnect grace or sit-out time runs out, for the table's runtime to send
 * `ExpireAbsences`; null when nobody is away. Missed hands count when a hand is dealt instead.
 */
export function absenceDueAt(table: TableState): number | null {
	if (table.status !== "open") return null;
	const { config } = table;
	const due = table.players.flatMap(({ status, disconnectedAt, sitOut }) => {
		if (status === "sitting-out") {
			return sitOut ? [sitOut.since + config.sitOutSeconds * 1000] : [];
		}
		return status !== "leaving" && disconnectedAt !== null
			? [disconnectedAt + config.reconnectGraceSeconds * 1000]
			: [];
	});
	return due.length > 0 ? Math.min(...due) : null;
}

/** A player who acts after the turn time pays the overrun out of their time bank. */
function chargeTimeBank(game: Game, table: OpenedTable, seat: number): void {
	const { turn } = table;
	if (!turn || turn.seat !== seat) return;
	const player = table.players.find((candidate) => candidate.seat === seat);
	const overrun = game.now - turnEndsAt(table, turn.startedAt);
	if (!player || overrun <= 0 || player.timeBankMs === 0) return;
	const usedMs = Math.min(overrun, player.timeBankMs);
	game.addTable([
		{
			type: "TimeBankUsed",
			v: 1,
			seat,
			usedMs,
			remainingMs: player.timeBankMs - usedMs,
		},
	]);
}

/**
 * Starts the clock when a player gets a new turn: someone else is to act now, or the same player
 * again after acting (the big blind heads-up, preflop then on the flop).
 */
function startTurn(game: Game, before: OpenedTable["turn"]): void {
	const { table, hand } = game;
	if (table.status !== "open" || !table.hand || hand.status !== "in-progress")
		return;
	const seat = hand.toAct;
	if (seat === null) return;
	const actedAgain = game.events.hand.some(
		(event) =>
			(event.type === "PlayerActed" ||
				event.type === "CardsShown" ||
				event.type === "CardsMucked") &&
			event.seat === before?.seat,
	);
	if (before?.handId === hand.handId && before.seat === seat && !actedAgain)
		return;
	game.addTable([
		{
			type: "TurnStarted",
			v: 1,
			handId: hand.handId,
			seat,
			startedAt: game.now,
		},
	]);
}

/**
 * A table that was opened, even if closed since: a closed table still reveals the deck of a hand
 * it called off, and refuses a second close itself.
 */
function startedTable(table: TableState): Result<OpenedTable, TableError> {
	return table.status === "unopened" ? err(new TableNotOpenError()) : ok(table);
}

function openTable(table: TableState): Result<OpenedTable, TableError> {
	if (table.status === "unopened") return err(new TableNotOpenError());
	if (table.status === "closed") return err(new TableClosedError());
	return ok(table);
}

function startHand(
	game: Game,
	table: OpenedTable,
	{
		handId,
		deck,
		buttonDraw,
		commitment,
	}: Extract<HandPlayCommand, { type: "StartHand" }>,
): Result<void, TableError> {
	if (table.hand) return err(new HandInProgressError());
	const positions = positionsFor(table, buttonDraw);
	if (!positions) return err(new NotEnoughPlayersError());
	const dealtIn = table.players.filter(({ seat }) =>
		positions.dealtIn.includes(seat),
	);
	const { buttonSeat, smallBlindSeat, bigBlindSeat } = positions;
	// The last hand has ended; this one starts in a stream of its own.
	game.hand = initialHandState;
	const started = game.play({
		type: "StartHand",
		config: {
			handId,
			smallBlind: table.config.smallBlind,
			bigBlind: table.config.bigBlind,
			ante: 0,
			buttonSeat,
			smallBlindSeat,
			bigBlindSeat,
			players: dealtIn.map(({ seat, userId, stack }) => ({
				seat,
				playerId: userId,
				stack,
			})),
			deck,
		},
	});
	if (!started.ok) return started;
	game.addTable([
		// Before the deal, so everyone has it before the first card (ADR-008).
		{ type: "DeckCommitted", v: 1, handId, commitment },
		...dealtIn
			.filter(({ status }) => status === "waiting-for-big-blind")
			.map(({ seat }): TableEvent => ({
				type: "PlayerStatusChanged",
				v: 1,
				seat,
				status: "active",
			})),
		{
			type: "HandScheduled",
			v: 1,
			handId,
			buttonSeat,
			smallBlindSeat,
			bigBlindSeat,
			seats: [...positions.dealtIn],
		},
	]);
	return ok(undefined);
}

/** Sends a player's command to the hand, on the seat they hold in it. */
function playerCommand(
	game: Game,
	table: OpenedTable,
	command: Extract<HandPlayCommand, { userId: string }>,
): Result<void, TableError> {
	if (!table.hand) return err(new NoHandError());
	const player = table.players.find(({ userId }) => userId === command.userId);
	if (!player) return err(new NotSeatedError());
	const { seat } = player;
	// A leaving player has folded or will on their turn: the hand is no longer theirs to play.
	if (player.status === "leaving") return err(new LeavingSeatError());
	if (!table.hand.seats.includes(seat)) return err(new NotInHandError());
	if (game.hand.status === "in-progress" && game.hand.toAct === seat) {
		chargeTimeBank(game, table, seat);
	}
	return game.play(
		command.type === "Act"
			? { type: "Act", seat, action: command.action, amount: command.amount }
			: { type: command.type, seat },
	);
}

/**
 * The turn timer ran out: the time bank is spent, then the player checks if they can, otherwise
 * folds (mucks at the showdown). A timer for another hand or turn, or one that fires before the
 * time is out, is refused, so a stale timer never times out a turn that is still running.
 */
function timeOut(
	game: Game,
	table: OpenedTable,
	{ handId, seat }: Extract<HandPlayCommand, { type: "Timeout" }>,
): Result<void, TableError> {
	const { turn } = table;
	if (!table.hand || turn?.handId !== handId || turn.seat !== seat) {
		return err(new NoHandError());
	}
	const dueAt = turnDueAt(table) as number;
	if (game.now < dueAt) return err(new TimeoutNotDueError(dueAt));
	chargeTimeBank(game, table, seat);
	return game.play({ type: "Timeout", seat });
}

/**
 * Publishes the server seed of a hand that has ended. It must hash to the commitment published
 * before the deal; a hand still running, another hand, or a second reveal is refused.
 */
function revealDeck(
	game: Game,
	table: OpenedTable,
	{ handId, serverSeed }: Extract<HandPlayCommand, { type: "RevealDeck" }>,
): Result<void, TableError> {
	const { deck } = table;
	if (
		!deck ||
		deck.handId !== handId ||
		deck.serverSeed !== null ||
		table.hand?.handId === handId
	) {
		return err(new NoHandError());
	}
	const isHex = /^(?:[0-9a-f]{2})+$/.test(serverSeed);
	if (!isHex || commitServerSeed(hexToBytes(serverSeed)) !== deck.commitment) {
		return err(new DeckMismatchError());
	}
	game.addTable([{ type: "DeckRevealed", v: 1, handId, serverSeed }]);
	return ok(undefined);
}

/**
 * The user's last connection closed: a player keeps the seat, with the time of the disconnect for
 * the absence policy; a spectator stops watching.
 */
function disconnect(
	game: Game,
	table: OpenedTable,
	userId: string,
): Result<void, TableError> {
	const player = table.players.find((seated) => seated.userId === userId);
	if (player) {
		if (player.disconnectedAt !== null)
			return err(new AlreadyDisconnectedError());
		game.addTable([
			{ type: "PlayerDisconnected", v: 1, seat: player.seat, at: game.now },
		]);
		return ok(undefined);
	}
	if (!table.spectators.includes(userId)) return err(new NotSeatedError());
	game.addTable([{ type: "SpectatorLeft", v: 1, userId }]);
	return ok(undefined);
}

/** A player is back: within the grace they play on; after it, they sit out until they sit in. */
function reconnect(
	game: Game,
	table: OpenedTable,
	userId: string,
): Result<void, TableError> {
	const player = table.players.find((seated) => seated.userId === userId);
	if (player?.disconnectedAt == null) return err(new NotDisconnectedError());
	game.addTable([{ type: "PlayerReconnected", v: 1, seat: player.seat }]);
	return ok(undefined);
}

/**
 * Closes the table by force: a running hand is called off and settled, every chip going back to
 * whoever put it in, then the table closes as `CloseTable` does. Its deck is still revealed after.
 */
function forceClose(game: Game, table: OpenedTable): Result<void, TableError> {
	if (table.status === "closed") return err(new TableClosedError());
	if (game.hand.status === "in-progress") {
		const cancelled = game.play({ type: "CancelHand" });
		// A running hand can always be called off.
		if (!cancelled.ok) return cancelled;
	}
	game.settle();
	const closed = decideTable({ type: "CloseTable" }, game.table);
	if (!closed.ok) return closed;
	game.addTable(closed.value);
	return ok(undefined);
}

function play(
	game: Game,
	table: OpenedTable,
	command: HandPlayCommand | AbsenceCommand | ForceCloseCommand,
): Result<void, TableError> {
	switch (command.type) {
		case "ForceCloseTable":
			return forceClose(game, table);
		case "StartHand":
			return startHand(game, table, command);
		case "Timeout":
			return timeOut(game, table, command);
		case "RevealDeck":
			return revealDeck(game, table, command);
		case "Disconnect":
			return disconnect(game, table, command.userId);
		case "Reconnect":
			return reconnect(game, table, command.userId);
		case "ExpireAbsences":
			// Whatever is due is applied below, as after every command.
			return ok(undefined);
		default:
			return playerCommand(game, table, command);
	}
}

/**
 * The table's decider with hands: seat and spectator commands go to `decideTable`, hand
 * commands to the hand being played, and whatever follows on its own is added, at `now` (epoch
 * ms): the absence policy's due seat changes, leaving players folding on their turn, an ended
 * hand settled into the table, the sit-out clocks of players who started sitting out, and the
 * clock of a new turn: the turn time, then the player's time bank.
 */
export function decideGame(
	command: GameCommand,
	state: GameState,
	now: number,
): GameDecision {
	const game = new Game(state.table, state.hand, now);
	const before = state.table.status === "unopened" ? null : state.table.turn;
	if (isTableCommand(command)) {
		const decision = decideTable(command, state.table);
		if (!decision.ok) return decision;
		game.addTable(decision.value);
	} else {
		const table =
			command.type === "RevealDeck" || command.type === "ForceCloseTable"
				? startedTable(state.table)
				: openTable(state.table);
		if (!table.ok) return table;
		const played = play(game, table.value, command);
		if (!played.ok) return played;
	}
	// Before settling, so a player who has to leave folds on their turn at once.
	const expired = game.expireAbsences();
	if (command.type === "ExpireAbsences" && !expired) {
		return err(new AbsenceNotDueError());
	}
	game.settle();
	game.startSitOutClocks();
	startTurn(game, before);
	return ok(game.events);
}

/** Applies the events of one decision to both states; a new hand replaces the last one. */
export function evolveGame(state: GameState, events: GameEvents): GameState {
	const newHand = events.hand[0]?.type === "HandStarted";
	return {
		table: events.table.reduce(evolveTable, state.table),
		hand: events.hand.reduce(
			evolveHand,
			newHand ? initialHandState : state.hand,
		),
	};
}
