import {
	decide as decideHand,
	evolve as evolveHand,
	firstHandPositions,
	type HandCommand,
	type HandEvent,
	type HandPositions,
	type HandState,
	initialHandState,
	legalActions,
	nextHandPositions,
} from "@holdem/engine";
import { err, ok, type Result } from "@/shared/domain/result.js";
import { decideTable } from "./decide-table.js";
import { evolveTable } from "./evolve-table.js";
import type { GameCommand, HandPlayCommand } from "./table-commands.js";
import {
	HandInProgressError,
	HandRuleError,
	LeavingSeatError,
	NoHandError,
	NotEnoughPlayersError,
	NotInHandError,
	NotSeatedError,
	type TableError,
	TableClosedError,
	TableNotOpenError,
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

const isPlayCommand = (command: GameCommand): command is HandPlayCommand =>
	["StartHand", "Act", "ShowCards", "MuckCards", "Timeout"].includes(
		command.type,
	);

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
				(event) => event.type === "HandEnded",
			);
			const stacks = ended?.type === "HandEnded" ? ended.stacks : [];
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
}

function openTable(table: TableState): Result<OpenedTable, TableError> {
	if (table.status === "unopened") return err(new TableNotOpenError());
	if (table.status === "closed") return err(new TableClosedError());
	return ok(table);
}

function startHand(
	game: Game,
	table: OpenedTable,
	{ handId, deck, buttonDraw }: Extract<HandPlayCommand, { type: "StartHand" }>,
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
	return game.play(
		command.type === "Act"
			? { type: "Act", seat, action: command.action, amount: command.amount }
			: { type: command.type, seat },
	);
}

function play(
	game: Game,
	table: OpenedTable,
	command: HandPlayCommand,
): Result<void, TableError> {
	switch (command.type) {
		case "StartHand":
			return startHand(game, table, command);
		case "Timeout":
			return table.hand?.handId === command.handId
				? game.play({ type: "Timeout", seat: command.seat })
				: err(new NoHandError());
		default:
			return playerCommand(game, table, command);
	}
}

/**
 * The table's decider with hands: seat and spectator commands go to `decideTable`, hand
 * commands to the hand being played, and whatever follows on its own is added: leaving players
 * fold on their turn, and an ended hand is settled into the table.
 */
export function decideGame(
	command: GameCommand,
	state: GameState,
): GameDecision {
	const game = new Game(state.table, state.hand);
	if (isPlayCommand(command)) {
		const table = openTable(state.table);
		if (!table.ok) return table;
		const played = play(game, table.value, command);
		if (!played.ok) return played;
	} else {
		const decision = decideTable(command, state.table);
		if (!decision.ok) return decision;
		game.addTable(decision.value);
	}
	game.settle();
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
