import { given, play } from "../testing/hand-harness.js";
import { handConfig } from "../testing/hand-fixtures.js";
import { legalActions } from "./betting.js";
import type { ActionKind, HandCommand } from "./commands.js";
import type { HandConfig } from "./config.js";
import type { HandEvent } from "./events.js";
import { replayHand } from "./evolve.js";
import type { ActiveHand } from "./state.js";

// RULES §8 "Short all-in and reopening the betting" (TDA 47), with the TDA Addendum illustrations.

const act = (seat: number, action: ActionKind, amount?: number): HandCommand =>
	amount === undefined
		? { type: "Act", seat, action }
		: { type: "Act", seat, action, amount };
const stateOf = (events: readonly HandEvent[]) =>
	replayHand(events) as ActiveHand;
const legal = (events: readonly HandEvent[], seat: number) =>
	legalActions(stateOf(events), seat);

/** Seats 0, 1, 2… with the given stacks. */
const table = (overrides: Partial<HandConfig>, ...stacks: number[]) =>
	handConfig({
		...overrides,
		players: stacks.map((stack, seat) => ({
			seat,
			playerId: `p${seat}`,
			stack,
		})),
	});

/** Collects the bets and deals the flop from the top of the deck. */
function toFlop(history: readonly HandEvent[]): HandEvent[] {
	const { deck, nextCard } = stateOf(history);
	return [
		...history,
		{ type: "PotsCollected", v: 1, pots: [] },
		{
			type: "StreetDealt",
			v: 1,
			street: "flop",
			burn: deck[nextCard]!,
			cards: deck.slice(nextCard + 1, nextCard + 4),
		},
	];
}

describe("TDA 47: a short all-in does not reopen the betting", () => {
	it("Example 1: after UTG's short all-in, players yet to act keep every option", () => {
		// Blinds 50/100, pre-flop. Button 0, blinds 1 and 2; UTG (seat 3) is all-in for 150.
		const config = table(
			{ smallBlind: 50, bigBlind: 100 },
			1000,
			1000,
			1000,
			150,
		);
		const history = play(
			play([], { type: "StartHand", config }),
			act(3, "all-in"),
		);
		expect(legal(history, 0)?.aggression).toEqual({
			kind: "raise",
			minTo: 250,
			maxTo: 1000,
		});
		// The big blind has not acted either, so it may still raise after two calls.
		const toBigBlind = play(history, act(0, "call"), act(1, "call"));
		expect(legal(toBigBlind, 2)?.aggression).toEqual({
			kind: "raise",
			minTo: 250,
			maxTo: 1000,
		});
	});

	describe("Example 2: short all-ins add up to a full raise", () => {
		// Blinds 50/100. Seats 0–4 are A–E with the button on E, so A and B post the blinds.
		const config = table(
			{ smallBlind: 50, bigBlind: 100, buttonSeat: 4 },
			1000,
			225,
			1000,
			300,
			1000,
		);
		const preflop = play(
			play([], { type: "StartHand", config }),
			act(2, "call"),
			act(3, "call"),
			act(4, "call"),
			act(0, "call"),
			act(1, "check"),
		);
		// After the flop: A bets 100, B is all-in for 125, C calls, D is all-in for 200, E calls.
		const flop = play(
			toFlop(preflop),
			act(0, "bet", 100),
			act(1, "all-in"),
			act(2, "call"),
			act(3, "all-in"),
			act(4, "call"),
		);

		it("A faces 100 more, a full raise in total, so A may fold, call or raise", () => {
			expect(legal(flop, 0)).toEqual({
				seat: 0,
				canFold: true,
				canCheck: false,
				callAmount: 100,
				aggression: { kind: "raise", minTo: 300, maxTo: 900 },
			});
		});

		it("if A only calls, C faces 75 more, not a full raise, so C may only call or fold", () => {
			const afterCall = play(flop, act(0, "call"));
			expect(stateOf(afterCall).toAct).toBe(2);
			expect(legal(afterCall, 2)).toEqual({
				seat: 2,
				canFold: true,
				canCheck: false,
				callAmount: 75,
				aggression: null,
			});
			given(afterCall)
				.when(act(2, "raise", 400))
				.then({ code: "hand.betting-not-reopened" });
			given(afterCall)
				.when(act(2, "all-in"))
				.then({ code: "hand.betting-not-reopened" });
			expect(stateOf(play(afterCall, act(2, "call"))).toAct).toBeNull();
		});
	});

	describe("Example 3: a player yet to act may raise; one who already acted may not", () => {
		// Blinds 2,000/4,000, pre-flop. Button 0 (C, 7,500 chips), blinds 1 and 2, A under the gun.
		const config = table(
			{ smallBlind: 2000, bigBlind: 4000 },
			7500,
			100_000,
			100_000,
			100_000,
		);
		const history = play(
			play([], { type: "StartHand", config }),
			act(3, "call"),
			act(0, "all-in"),
			act(1, "fold"),
		);

		it("the big blind has not acted, so it may raise to at least 11,500", () => {
			expect(legal(history, 2)?.aggression).toEqual({
				kind: "raise",
				minTo: 11_500,
				maxTo: 100_000,
			});
		});

		it("if the big blind only calls, A faces 3,500 more and may only call or fold", () => {
			const afterCall = play(history, act(2, "call"));
			expect(legal(afterCall, 3)).toMatchObject({
				callAmount: 3500,
				aggression: null,
			});
			given(afterCall)
				.when(act(3, "raise", 15_500))
				.then({ code: "hand.betting-not-reopened" });
		});

		it("if the big blind makes a full raise, the betting is open to A again", () => {
			const afterRaise = play(history, act(2, "raise", 11_500));
			expect(legal(afterRaise, 3)?.aggression).toEqual({
				kind: "raise",
				minTo: 15_500,
				maxTo: 100_000,
			});
		});
	});

	it("a short all-in bet below the big blind does not reopen it for a player who checked", () => {
		// Seat 3 has 7 chips left after the flop and bets them all; seat 1 checked before it.
		const config = table({}, 1000, 1000, 1000, 17);
		const preflop = play(
			play([], { type: "StartHand", config }),
			act(3, "call"),
			act(0, "call"),
			act(1, "call"),
			act(2, "check"),
		);
		const history = play(
			toFlop(preflop),
			act(1, "check"),
			act(2, "check"),
			act(3, "all-in"),
		);
		// Seat 0 has not acted on the flop: full options.
		expect(legal(history, 0)?.aggression).toEqual({
			kind: "raise",
			minTo: 17,
			maxTo: 990,
		});
		const backToChecker = play(history, act(0, "call"));
		expect(legal(backToChecker, 1)).toMatchObject({
			callAmount: 7,
			aggression: null,
		});
	});

	it("a full raise reopens the betting for everyone who acted before it", () => {
		const flop = toFlop(
			play(
				play([], { type: "StartHand", config: handConfig() }),
				act(0, "call"),
				act(1, "call"),
				act(2, "check"),
			),
		);
		const history = play(
			flop,
			act(1, "bet", 20),
			act(2, "raise", 60),
			act(0, "call"),
		);
		expect(legal(history, 1)?.aggression).toEqual({
			kind: "raise",
			minTo: 100,
			maxTo: 990,
		});
	});
});
