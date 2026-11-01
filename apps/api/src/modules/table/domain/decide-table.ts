import type { Chips } from "@holdem/engine";
import { err, ok, type Result } from "@/shared/domain/result.js";
import type { TableCommand } from "./table-commands.js";
import {
	buyInRange,
	type TableConfig,
	validateTableConfig,
} from "./table-config.js";
import {
	AlreadySeatedError,
	AlreadySittingOutError,
	AlreadySpectatingError,
	BuyInOutOfRangeError,
	HandInProgressError,
	InHandError,
	InvalidTableConfigError,
	LeavingSeatError,
	NoChipsError,
	NotBustedError,
	NotSeatedError,
	NotSittingOutError,
	NotSpectatingError,
	NotVerifiedError,
	SeatOutOfRangeError,
	SeatTakenError,
	SpectatorsFullError,
	StackFullError,
	TableAlreadyOpenError,
	TableClosedError,
	type TableError,
	TableNotOpenError,
} from "./table-errors.js";
import type { TableEvent } from "./table-events.js";
import {
	MAX_SPECTATORS,
	type OpenedTable,
	type SeatedPlayer,
	type TableState,
} from "./table-state.js";

export type TableDecision = Result<readonly TableEvent[], TableError>;

const accept = (...events: TableEvent[]): TableDecision => ok(events);

const isChips = (amount: Chips) => Number.isSafeInteger(amount) && amount >= 0;

/** Whether the player is dealt into the hand being played. */
const inHand = (table: OpenedTable, player: SeatedPlayer) =>
	table.hand?.seats.includes(player.seat) ?? false;

/** The open table, or why a command cannot reach it. */
function openTable(state: TableState): Result<OpenedTable, TableError> {
	if (state.status === "unopened") return err(new TableNotOpenError());
	if (state.status === "closed") return err(new TableClosedError());
	return ok(state);
}

/** The user's seat at the open table, unless they are leaving it. */
function seatOf(
	state: TableState,
	userId: string,
): Result<{ table: OpenedTable; player: SeatedPlayer }, TableError> {
	const table = openTable(state);
	if (!table.ok) return table;
	const player = table.value.players.find((seated) => seated.userId === userId);
	if (!player) return err(new NotSeatedError());
	if (player.status === "leaving") return err(new LeavingSeatError());
	return ok({ table: table.value, player });
}

function openNew(
	state: TableState,
	command: Extract<TableCommand, { type: "OpenTable" }>,
): TableDecision {
	if (state.status !== "unopened") return err(new TableAlreadyOpenError());
	const reason =
		command.tableId.length === 0
			? "table-id"
			: validateTableConfig(command.config);
	if (reason) return err(new InvalidTableConfigError(reason));
	// A copy, so the event never shares objects with the caller and stays plain JSON.
	const { config } = command;
	return accept({
		type: "TableOpened",
		v: 1,
		tableId: command.tableId,
		config: {
			smallBlind: config.smallBlind,
			bigBlind: config.bigBlind,
			minBuyInBigBlinds: config.minBuyInBigBlinds,
			maxBuyInBigBlinds: config.maxBuyInBigBlinds,
			maxSeats: config.maxSeats,
			turnSeconds: config.turnSeconds,
			timeBankSeconds: config.timeBankSeconds,
			reconnectGraceSeconds: config.reconnectGraceSeconds,
			disconnectedTurnSeconds: config.disconnectedTurnSeconds,
			sitOutSeconds: config.sitOutSeconds,
			sitOutHands: config.sitOutHands,
			visibility: config.visibility,
		},
	});
}

/** A seated spectator stops watching: the seat is how they follow the table now. */
function takeSeat(
	state: TableState,
	command: Extract<TableCommand, { type: "TakeSeat" }>,
): TableDecision {
	const opened = openTable(state);
	if (!opened.ok) return opened;
	const table = opened.value;
	const { userId, seat, buyIn } = command;
	if (!command.verified) return err(new NotVerifiedError());
	const seated = table.players.find((player) => player.userId === userId);
	if (seated) return err(new AlreadySeatedError(seated.seat));
	if (
		!Number.isSafeInteger(seat) ||
		seat < 0 ||
		seat >= table.config.maxSeats
	) {
		return err(new SeatOutOfRangeError(seat, table.config.maxSeats));
	}
	if (table.players.some((player) => player.seat === seat)) {
		return err(new SeatTakenError(seat));
	}
	const { min, max } = buyInRange(table.config);
	if (!isChips(buyIn) || buyIn < min || buyIn > max) {
		return err(new BuyInOutOfRangeError(min, max));
	}
	const taken: TableEvent = { type: "SeatTaken", v: 1, seat, userId, buyIn };
	return table.spectators.includes(userId)
		? accept({ type: "SpectatorLeft", v: 1, userId }, taken)
		: accept(taken);
}

/** A player dealt into the running hand keeps the seat until it ends, and folds on their turn (`decideGame`). */
function leaveSeat(state: TableState, userId: string): TableDecision {
	const found = seatOf(state, userId);
	if (!found.ok) return found;
	const { table, player } = found.value;
	return inHand(table, player)
		? accept({
				type: "PlayerStatusChanged",
				v: 1,
				seat: player.seat,
				status: "leaving",
			})
		: accept({ type: "SeatLeft", v: 1, seat: player.seat, userId });
}

/** Sitting out during a hand takes effect from the next one: the player still plays this one out. */
function sitOut(state: TableState, userId: string): TableDecision {
	const found = seatOf(state, userId);
	if (!found.ok) return found;
	const { player } = found.value;
	if (player.status === "sitting-out") return err(new AlreadySittingOutError());
	return accept({
		type: "PlayerStatusChanged",
		v: 1,
		seat: player.seat,
		status: "sitting-out",
	});
}

/**
 * A player back from sitting out waits for the big blind like a new one, so sitting out cannot
 * dodge the blinds. One who sat out during a hand they are still in has missed nothing, and is
 * active again.
 */
function sitIn(state: TableState, userId: string): TableDecision {
	const found = seatOf(state, userId);
	if (!found.ok) return found;
	const { table, player } = found.value;
	if (player.status !== "sitting-out") return err(new NotSittingOutError());
	if (player.stack === 0) return err(new NoChipsError());
	return accept({
		type: "PlayerStatusChanged",
		v: 1,
		seat: player.seat,
		status: inHand(table, player) ? "active" : "waiting-for-big-blind",
	});
}

/** How many chips a rebuy or a top-up may add, or why the player cannot add any. */
function addable(
	type: "Rebuy" | "TopUp",
	player: SeatedPlayer,
	config: TableConfig,
): Result<{ readonly min: Chips; readonly max: Chips }, TableError> {
	const range = buyInRange(config);
	if (type === "Rebuy") {
		return player.stack > 0 ? err(new NotBustedError()) : ok(range);
	}
	if (player.stack === 0) return err(new NoChipsError());
	// Winnings can take a stack past the maximum buy-in; it is then not topped up.
	if (player.stack >= range.max) return err(new StackFullError(range.max));
	return ok({ min: 1, max: range.max - player.stack });
}

/** Chips change hands only between the player's hands: their stack is in play during one. */
function addChips(
	state: TableState,
	command: Extract<TableCommand, { type: "Rebuy" | "TopUp" }>,
): TableDecision {
	const found = seatOf(state, command.userId);
	if (!found.ok) return found;
	const { table, player } = found.value;
	if (inHand(table, player)) return err(new InHandError());
	const range = addable(command.type, player, table.config);
	if (!range.ok) return range;
	const { min, max } = range.value;
	const { amount } = command;
	if (!isChips(amount) || amount < min || amount > max) {
		return err(new BuyInOutOfRangeError(min, max));
	}
	return accept({
		type: "ChipsAdded",
		v: 1,
		seat: player.seat,
		amount,
		reason: command.type === "Rebuy" ? "rebuy" : "top-up",
	});
}

function joinAsSpectator(state: TableState, userId: string): TableDecision {
	const opened = openTable(state);
	if (!opened.ok) return opened;
	const table = opened.value;
	const seated = table.players.find((player) => player.userId === userId);
	if (seated) return err(new AlreadySeatedError(seated.seat));
	if (table.spectators.includes(userId)) {
		return err(new AlreadySpectatingError());
	}
	if (table.spectators.length >= MAX_SPECTATORS) {
		return err(new SpectatorsFullError(MAX_SPECTATORS));
	}
	return accept({ type: "SpectatorJoined", v: 1, userId });
}

function leaveSpectating(state: TableState, userId: string): TableDecision {
	const opened = openTable(state);
	if (!opened.ok) return opened;
	if (!opened.value.spectators.includes(userId)) {
		return err(new NotSpectatingError());
	}
	return accept({ type: "SpectatorLeft", v: 1, userId });
}

/** Everyone leaves first, so whatever follows the table sees it empty once it is closed. */
function closeTable(state: TableState): TableDecision {
	const opened = openTable(state);
	if (!opened.ok) return opened;
	const table = opened.value;
	if (table.hand) return err(new HandInProgressError());
	return accept(
		...table.players.map(({ seat, userId }): TableEvent => ({
			type: "SeatLeft",
			v: 1,
			seat,
			userId,
		})),
		...table.spectators.map((userId): TableEvent => ({
			type: "SpectatorLeft",
			v: 1,
			userId,
		})),
		{ type: "TableClosed", v: 1 },
	);
}

/** The table decider (ADR-002): the events a command produces, or the rule it breaks. */
export function decideTable(
	command: TableCommand,
	state: TableState,
): TableDecision {
	switch (command.type) {
		case "OpenTable":
			return openNew(state, command);
		case "TakeSeat":
			return takeSeat(state, command);
		case "LeaveSeat":
			return leaveSeat(state, command.userId);
		case "SitOut":
			return sitOut(state, command.userId);
		case "SitIn":
			return sitIn(state, command.userId);
		case "Rebuy":
		case "TopUp":
			return addChips(state, command);
		case "JoinAsSpectator":
			return joinAsSpectator(state, command.userId);
		case "LeaveSpectating":
			return leaveSpectating(state, command.userId);
		case "CloseTable":
			return closeTable(state);
	}
}
