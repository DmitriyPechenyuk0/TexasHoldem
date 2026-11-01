import type { SeatIndex } from "@holdem/engine";
import type { TableEvent } from "./table-events.js";
import {
	initialTableState,
	type OpenedTable,
	type SeatedPlayer,
	type TableState,
} from "./table-state.js";

function opened(state: TableState, event: TableEvent): OpenedTable {
	if (state.status === "unopened") {
		throw new Error(`${event.type} cannot come before TableOpened`);
	}
	return state;
}

function updatePlayer(
	state: OpenedTable,
	seat: SeatIndex,
	update: (player: SeatedPlayer) => Partial<SeatedPlayer>,
): OpenedTable {
	if (!state.players.some((player) => player.seat === seat)) {
		throw new Error(`Seat ${seat} of table ${state.tableId} is empty`);
	}
	return {
		...state,
		players: state.players.map((player) =>
			player.seat === seat ? { ...player, ...update(player) } : player,
		),
	};
}

/**
 * Applies an event that `decideTable` produced. Events are facts, so their rules are not checked
 * again; it throws only on one that cannot apply at all, which means a corrupt stream.
 */
export function evolveTable(state: TableState, event: TableEvent): TableState {
	switch (event.type) {
		case "TableOpened":
			return {
				status: "open",
				tableId: event.tableId,
				config: event.config,
				players: [],
				spectators: [],
				hand: null,
				positions: null,
			};
		case "SeatTaken": {
			const table = opened(state, event);
			const player: SeatedPlayer = {
				seat: event.seat,
				userId: event.userId,
				stack: event.buyIn,
				status: "waiting-for-big-blind",
			};
			return {
				...table,
				players: [...table.players, player].toSorted((a, b) => a.seat - b.seat),
			};
		}
		case "SeatLeft": {
			const table = opened(state, event);
			return {
				...table,
				players: table.players.filter((player) => player.seat !== event.seat),
			};
		}
		case "PlayerStatusChanged":
			return updatePlayer(opened(state, event), event.seat, () => ({
				status: event.status,
			}));
		case "ChipsAdded":
			return updatePlayer(opened(state, event), event.seat, (player) => ({
				stack: player.stack + event.amount,
			}));
		case "SpectatorJoined": {
			const table = opened(state, event);
			return { ...table, spectators: [...table.spectators, event.userId] };
		}
		case "SpectatorLeft": {
			const table = opened(state, event);
			return {
				...table,
				spectators: table.spectators.filter((id) => id !== event.userId),
			};
		}
		case "HandScheduled": {
			const table = opened(state, event);
			const { handId, buttonSeat, smallBlindSeat, bigBlindSeat, seats } = event;
			return {
				...table,
				hand: { handId, seats },
				positions: { buttonSeat, smallBlindSeat, bigBlindSeat },
			};
		}
		case "HandSettled": {
			const table = opened(state, event);
			const stacks = new Map(
				event.stacks.map(({ seat, stack }) => [seat, stack]),
			);
			return {
				...table,
				hand: null,
				players: table.players.map((player) => ({
					...player,
					stack: stacks.get(player.seat) ?? player.stack,
				})),
			};
		}
		case "TableClosed":
			return { ...opened(state, event), status: "closed" };
	}
}

/** The state after `events`, from `from` (the start of the stream by default). */
export const replayTable = (
	events: readonly TableEvent[],
	from: TableState = initialTableState,
): TableState => events.reduce(evolveTable, from);
