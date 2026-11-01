import { fullDeck, type HandEvent } from "@holdem/engine";
import {
	seatTaken,
	statusChanged,
	tableWith,
} from "../../../../test/support/table.js";
import { replayTable } from "./evolve-table.js";
import {
	decideGame,
	evolveGame,
	type GameEvents,
	type GameState,
	handReady,
	initialGameState,
} from "./game.js";
import type { GameCommand } from "./table-commands.js";
import { HandRuleError } from "./table-errors.js";
import type { TableEvent } from "./table-events.js";
import type { OpenedTable } from "./table-state.js";

const deck = fullDeck();

const gameOf = (history: readonly TableEvent[]): GameState => ({
	...initialGameState,
	table: replayTable(history),
});

/** Runs a command that must be accepted: answers its events and the state after them. */
function run(state: GameState, command: GameCommand) {
	const decision = decideGame(command, state);
	if (!decision.ok) {
		throw new Error(`${command.type} refused: ${decision.error.code}`);
	}
	expect(JSON.parse(JSON.stringify(decision.value))).toEqual(decision.value);
	return { events: decision.value, state: evolveGame(state, decision.value) };
}

const refusal = (state: GameState, command: GameCommand) => {
	const decision = decideGame(command, state);
	return decision.ok
		? null
		: { code: decision.error.code, params: decision.error.params };
};

const start = (state: GameState, handId = "hand-1", buttonDraw = 0) =>
	run(state, { type: "StartHand", handId, deck, buttonDraw });

const table = (state: GameState) => state.table as OpenedTable;
const typesOf = (events: GameEvents) => ({
	table: events.table.map((event) => event.type),
	hand: events.hand.map((event) => event.type),
});
const toAct = (state: GameState) =>
	state.hand.status === "idle" ? null : state.hand.toAct;
const userAt = (state: GameState, seat: number | null) =>
	table(state).players.find((player) => player.seat === seat)!.userId;
const settled = (events: GameEvents) =>
	events.table.find((event) => event.type === "HandSettled");

describe("decideGame", () => {
	describe("StartHand", () => {
		it("needs an open table with two players ready, and no hand running", () => {
			const command: GameCommand = {
				type: "StartHand",
				handId: "hand-1",
				deck,
				buttonDraw: 0,
			};
			expect(refusal(initialGameState, command)).toEqual({
				code: "table.not-open",
				params: undefined,
			});
			expect(refusal(gameOf(tableWith(0)), command)?.code).toBe(
				"table.not-enough-players",
			);
			const oneSittingOut = gameOf([
				...tableWith(0, 1),
				statusChanged(1, "sitting-out"),
			]);
			expect(refusal(oneSittingOut, command)?.code).toBe(
				"table.not-enough-players",
			);
			const running = start(gameOf(tableWith(0, 1))).state;
			expect(refusal(running, command)?.code).toBe("table.hand-in-progress");
		});

		it("deals in every player ready when the table starts, with the button drawn among them", () => {
			const { events, state } = start(gameOf(tableWith(0, 2, 4)), "hand-1", 7);

			expect(events.table).toEqual([
				statusChanged(0, "active"),
				statusChanged(2, "active"),
				statusChanged(4, "active"),
				{
					type: "HandScheduled",
					v: 1,
					handId: "hand-1",
					// 7 % 3 picks seat 2 of [0, 2, 4].
					buttonSeat: 2,
					smallBlindSeat: 4,
					bigBlindSeat: 0,
					seats: [0, 2, 4],
				},
			]);
			expect(events.hand[0]).toMatchObject({
				type: "HandStarted",
				handId: "hand-1",
				smallBlind: 1,
				bigBlind: 2,
				ante: 0,
				players: [
					{ seat: 0, playerId: "u0", stack: 200 },
					{ seat: 2, playerId: "u2", stack: 200 },
					{ seat: 4, playerId: "u4", stack: 200 },
				],
				deck,
			});
			expect(table(state).hand).toEqual({ handId: "hand-1", seats: [0, 2, 4] });
			expect(state.hand.status).toBe("in-progress");
		});

		it("refuses a deck the hand cannot use", () => {
			const decision = decideGame(
				{ type: "StartHand", handId: "hand-1", deck: [], buttonDraw: 0 },
				gameOf(tableWith(0, 1)),
			);
			expect(decision).toMatchObject({
				ok: false,
				error: { code: "hand.invalid-config", params: { reason: "deck" } },
			});
		});
	});

	describe("hand commands", () => {
		it("go to the hand on the player's seat, and its refusals pass through", () => {
			const { state } = start(gameOf(tableWith(0, 1, 2)));
			const first = toAct(state);
			const other = [0, 1, 2].find((seat) => seat !== first)!;

			expect(
				refusal(state, { type: "Act", userId: "nobody", action: "fold" })?.code,
			).toBe("table.not-seated");
			expect(
				refusal(state, {
					type: "Act",
					userId: userAt(state, other),
					action: "fold",
				}),
			).toEqual({ code: "hand.not-your-turn", params: { seat: other } });
			expect(
				refusal(state, { type: "ShowCards", userId: userAt(state, first) })
					?.code,
			).toBe("hand.showdown-not-reached");

			const { events } = run(state, {
				type: "Act",
				userId: userAt(state, first),
				action: "fold",
			});
			expect(events).toEqual({
				table: [],
				hand: [
					{
						type: "PlayerActed",
						v: 1,
						seat: first,
						action: "fold",
						amount: 0,
						allIn: false,
					},
				],
			});
		});

		it("are refused without a hand, and for a player not dealt into it", () => {
			const idle = gameOf(tableWith(0, 1));
			expect(refusal(idle, { type: "MuckCards", userId: "u0" })?.code).toBe(
				"table.no-hand",
			);

			const running = start(idle).state;
			const joined = run(running, {
				type: "TakeSeat",
				userId: "u5",
				verified: true,
				seat: 5,
				buyIn: 200,
			}).state;
			expect(
				refusal(joined, { type: "Act", userId: "u5", action: "check" })?.code,
			).toBe("table.not-in-hand");
		});

		it("time out only the hand they were set for", () => {
			const { state } = start(gameOf(tableWith(0, 1, 2)));
			const seat = toAct(state)!;

			expect(
				refusal(state, { type: "Timeout", handId: "hand-0", seat })?.code,
			).toBe("table.no-hand");
			const { events } = run(state, {
				type: "Timeout",
				handId: "hand-1",
				seat,
			});
			expect(events.hand).toEqual([
				{
					type: "PlayerActed",
					v: 1,
					seat,
					action: "fold",
					amount: 0,
					allIn: false,
					auto: true,
				},
			]);
		});
	});

	describe("the end of a hand", () => {
		it("settles the stacks into the table and frees it for the next hand", () => {
			const { state } = start(gameOf(tableWith(0, 1)));
			// Heads-up, the button posts the small blind and acts first: folding gives up 1 chip.
			const { events, state: after } = run(state, {
				type: "Act",
				userId: userAt(state, toAct(state)),
				action: "fold",
			});

			expect(typesOf(events)).toEqual({
				table: ["HandSettled"],
				hand: [
					"PlayerActed",
					"UncalledBetReturned",
					"PotsCollected",
					"PotAwarded",
					"HandEnded",
				],
			});
			expect(settled(events)).toEqual({
				type: "HandSettled",
				v: 1,
				handId: "hand-1",
				stacks: [
					{ seat: 0, stack: 199 },
					{ seat: 1, stack: 201 },
				],
			});
			expect(table(after).hand).toBeNull();
			expect(table(after).players.map(({ stack }) => stack)).toEqual([
				199, 201,
			]);
			expect(handReady(after.table)).toBe(true);
		});

		it("sits out a player who lost their stack, until they rebuy", () => {
			let { state } = start(gameOf(tableWith(0, 1)));
			for (const action of ["all-in", "call"] as const) {
				state = run(state, {
					type: "Act",
					userId: userAt(state, toAct(state)),
					action,
				}).state;
			}
			// Equal stacks: unless they split, one of them has none left.
			const busted = table(state).players.filter(({ stack }) => stack === 0);
			for (const { seat, status } of table(state).players) {
				expect(status).toBe(
					busted.some((p) => p.seat === seat) ? "sitting-out" : "active",
				);
			}
			expect(handReady(state.table)).toBe(busted.length === 0);
		});

		it("next deals by the dead button rule: the big blind moves on one player", () => {
			let { state } = start(gameOf(tableWith(0, 1, 2)), "hand-1", 0);
			expect(table(state).positions).toEqual({
				buttonSeat: 0,
				smallBlindSeat: 1,
				bigBlindSeat: 2,
			});
			// Seat 4 sits down mid-hand: it waits for the big blind, which reaches seat 4 next hand.
			state = run(state, {
				type: "TakeSeat",
				userId: "u4",
				verified: true,
				seat: 4,
				buyIn: 200,
			}).state;
			while (state.hand.status === "in-progress") {
				state = run(state, {
					type: "Act",
					userId: userAt(state, toAct(state)),
					action: "fold",
				}).state;
			}

			const { events } = start(state, "hand-2");
			expect(events.table).toEqual([
				statusChanged(4, "active"),
				{
					type: "HandScheduled",
					v: 1,
					handId: "hand-2",
					buttonSeat: 1,
					smallBlindSeat: 2,
					bigBlindSeat: 4,
					seats: [0, 1, 2, 4],
				},
			]);
		});
	});

	describe("leaving and sitting out during a hand", () => {
		it("folds a leaving player at once on their turn, and lets them go when the hand ends", () => {
			const { state } = start(gameOf(tableWith(0, 1, 2)));
			const seat = toAct(state)!;

			const { events, state: after } = run(state, {
				type: "LeaveSeat",
				userId: userAt(state, seat),
			});

			expect(events.table).toEqual([statusChanged(seat, "leaving")]);
			expect(events.hand).toEqual([
				{
					type: "PlayerActed",
					v: 1,
					seat,
					action: "fold",
					amount: 0,
					allIn: false,
				},
			]);
			expect(table(after).players.find((p) => p.seat === seat)?.status).toBe(
				"leaving",
			);
			expect(
				refusal(after, { type: "Act", userId: `u${seat}`, action: "fold" })
					?.code,
			).toBe("table.leaving-seat");
		});

		it("folds a leaving player when their turn comes, then frees the seat after the hand", () => {
			let { state } = start(gameOf(tableWith(0, 1, 2)));
			const first = toAct(state)!;
			const leaver =
				[0, 1, 2].find((seat) => seat !== first && seat !== 2) ?? 2;
			state = run(state, { type: "LeaveSeat", userId: `u${leaver}` }).state;
			expect(toAct(state)).toBe(first);

			let events: GameEvents = { table: [], hand: [] };
			while (state.hand.status === "in-progress") {
				({ events, state } = run(state, {
					type: "Act",
					userId: userAt(state, toAct(state)),
					action: "fold",
				}));
			}

			expect(
				events.table.filter((event) => event.type !== "PlayerStatusChanged"),
			).toEqual([
				expect.objectContaining({ type: "HandSettled" }),
				{ type: "SeatLeft", v: 1, seat: leaver, userId: `u${leaver}` },
			]);
			expect(table(state).players.map(({ seat }) => seat)).not.toContain(
				leaver,
			);
		});

		it("deals no more hands to a player who sat out during one, which they play out", () => {
			let { state } = start(gameOf(tableWith(0, 1, 2)));
			const seat = toAct(state)!;
			state = run(state, { type: "SitOut", userId: `u${seat}` }).state;

			// Still in this hand: it is their turn and they act.
			state = run(state, {
				type: "Act",
				userId: `u${seat}`,
				action: "fold",
			}).state;
			while (state.hand.status === "in-progress") {
				state = run(state, {
					type: "Act",
					userId: userAt(state, toAct(state)),
					action: "fold",
				}).state;
			}

			const next = start(state, "hand-2").events.table.find(
				(event) => event.type === "HandScheduled",
			);
			expect(next).toMatchObject({
				seats: [0, 1, 2].filter((s) => s !== seat),
			});
		});
	});

	it("passes seat and spectator commands to the table decider", () => {
		const { events } = run(gameOf(tableWith(0)), {
			type: "TakeSeat",
			userId: "u1",
			verified: true,
			seat: 1,
			buyIn: 200,
		});
		expect(events).toEqual({ table: [seatTaken(1)], hand: [] });
		expect(
			refusal(gameOf(tableWith(0)), { type: "SitIn", userId: "u0" })?.code,
		).toBe("table.not-sitting-out");
	});

	it("keeps the hand of a closed table closed to commands", () => {
		const closed = gameOf([...tableWith(), { type: "TableClosed", v: 1 }]);
		expect(
			refusal(closed, { type: "Act", userId: "u0", action: "fold" })?.code,
		).toBe("table.closed");
		expect(handReady(closed.table)).toBe(false);
	});
});

describe("HandRuleError", () => {
	it("carries the hand's code, and its params when it has some", () => {
		expect(new HandRuleError({ code: "hand.over" })).toMatchObject({
			kind: "rule-violation",
			code: "hand.over",
			params: undefined,
		});
		expect(
			new HandRuleError({ code: "hand.bet-too-small", params: { minTo: 4 } })
				.params,
		).toEqual({ minTo: 4 });
	});
});

describe("evolveGame", () => {
	it("applies the events of each stream to its state", () => {
		const { events } = start(gameOf(tableWith(0, 1)));
		const after = evolveGame(gameOf(tableWith(0, 1)), events);
		expect(after.hand).toMatchObject({
			status: "in-progress",
			handId: "hand-1",
		});
		expect((events.hand as HandEvent[]).length).toBeGreaterThan(0);
	});
});
