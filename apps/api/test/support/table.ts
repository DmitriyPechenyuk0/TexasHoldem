import type { Chips, SeatIndex } from "@holdem/engine";
import { DomainError } from "@/shared/domain/domain-error.js";
import { decideTable } from "@/modules/table/domain/decide-table.js";
import { replayTable } from "@/modules/table/domain/evolve-table.js";
import type { TableCommand } from "@/modules/table/domain/table-commands.js";
import type { TableConfig } from "@/modules/table/domain/table-config.js";
import type { TableError } from "@/modules/table/domain/table-errors.js";
import type { TableEvent } from "@/modules/table/domain/table-events.js";
import type {
	CurrentHand,
	TableState,
} from "@/modules/table/domain/table-state.js";

/** A 1/2 table for six with a buy-in of 50–200 big blinds (100–400 chips); override any part. */
export const tableConfig = (
	overrides: Partial<TableConfig> = {},
): TableConfig => ({
	smallBlind: 1,
	bigBlind: 2,
	minBuyInBigBlinds: 50,
	maxBuyInBigBlinds: 200,
	maxSeats: 6,
	turnSeconds: 20,
	timeBankSeconds: 30,
	visibility: "public",
	...overrides,
});

export const tableOpened = (config = tableConfig()): TableEvent => ({
	type: "TableOpened",
	v: 1,
	tableId: "table-1",
	config,
});

/** User `u<seat>` sits at `seat` with 200 chips. */
export const seatTaken = (
	seat: SeatIndex,
	buyIn = 200,
	userId = `u${seat}`,
): TableEvent => ({ type: "SeatTaken", v: 1, seat, userId, buyIn });

export const statusChanged = (
	seat: SeatIndex,
	status: Extract<TableEvent, { type: "PlayerStatusChanged" }>["status"],
): TableEvent => ({ type: "PlayerStatusChanged", v: 1, seat, status });

/** An open table with players at these seats, each `u<seat>` with 200 chips. */
export const tableWith = (...seats: SeatIndex[]): TableEvent[] => [
	tableOpened(),
	...seats.map((seat) => seatTaken(seat)),
];

/** What a rejected command must carry: its code, and its params when it has some. */
export interface ExpectedError {
	readonly code: TableError["code"];
	readonly params?: Readonly<Record<string, string | number>>;
}

/**
 * What hand orchestration (POK-76) will record with events: the hand being played, and stacks
 * after hands. Until then tests set them directly.
 */
export interface HandOutcome {
	readonly hand?: CurrentHand;
	readonly stacks?: Readonly<Record<SeatIndex, Chips>>;
}

function withOutcome(
	state: TableState,
	{ hand, stacks = {} }: HandOutcome,
): TableState {
	if (state.status === "unopened") {
		return state;
	}
	return {
		...state,
		hand: hand ?? state.hand,
		players: state.players.map((player) => ({
			...player,
			stack: stacks[player.seat] ?? player.stack,
		})),
	};
}

/**
 * Given/When/Then for the table decider (ADR-002), like the hand harness in the engine:
 * `given(history).when(command).then(expected)`, where `expected` is the events the command must
 * produce, or the error it must be rejected with. Accepted events are also checked to be plain JSON
 * and to apply cleanly.
 */
export function given(
	history: readonly TableEvent[],
	outcome: HandOutcome = {},
) {
	const state = withOutcome(replayTable(history), outcome);
	return {
		state,
		when(command: TableCommand) {
			const decision = decideTable(command, state);
			return {
				decision,
				/** Asserts the outcome and returns the state after it (unchanged for an error). */
				// oxlint-disable-next-line unicorn/no-thenable -- reads as given/when/then; never awaited
				then(expected: readonly TableEvent[] | ExpectedError): TableState {
					if (Array.isArray(expected)) {
						expect(decision).toEqual({ ok: true, value: expected });
						const events = decision.ok ? decision.value : [];
						expect(JSON.parse(JSON.stringify(events))).toEqual(events);
						return replayTable(events, state);
					}
					expect(decision.ok).toBe(false);
					const { error } = decision as Extract<typeof decision, { ok: false }>;
					expect(error).toBeInstanceOf(DomainError);
					// `Array.isArray` does not narrow a readonly array out of the union.
					const { code, params } = expected as ExpectedError;
					expect({ code: error.code, params: error.params }).toEqual({
						code,
						params,
					});
					return state;
				},
			};
		},
	};
}
