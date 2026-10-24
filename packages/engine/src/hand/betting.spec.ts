import { given, play } from "../testing/hand-harness.js";
import { handConfig, players } from "../testing/hand-fixtures.js";
import { legalActions } from "./betting.js";
import type { ActionKind, HandCommand } from "./commands.js";
import type { HandConfig, HandPlayer } from "./config.js";
import type { HandEvent } from "./events.js";
import { replayHand } from "./evolve.js";
import type { ActiveHand } from "./state.js";

const act = (seat: number, action: ActionKind, amount?: number): HandCommand =>
	amount === undefined
		? { type: "Act", seat, action }
		: { type: "Act", seat, action, amount };

const acted = (
	seat: number,
	action: "fold" | "check" | "call" | "bet" | "raise",
	amount = 0,
	allIn = false,
): Extract<HandEvent, { type: "PlayerActed" }> => ({
	type: "PlayerActed",
	v: 1,
	seat,
	action,
	amount,
	allIn,
});

const stateOf = (events: readonly HandEvent[]) =>
	replayHand(events) as ActiveHand;
const start = (config: HandConfig) => play([], { type: "StartHand", config });
const at = (seat: number, stack: number): HandPlayer => ({
	seat,
	playerId: `p${seat}`,
	stack,
});

/** Ends preflop by hand: collects the bets and deals the flop from the top of the deck. */
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

// Three-handed 5/10, 1,000 chips each: button 0, small blind 1, big blind 2; seat 0 acts first.
const threeHanded = start(handConfig());

describe("turn order (RULES §6)", () => {
	it("lets only the player to act act", () => {
		given(threeHanded)
			.when(act(1, "call"))
			.then({ code: "hand.not-your-turn", params: { seat: 1 } });
		expect(legalActions(stateOf(threeHanded), 1)).toBeNull();
	});

	it("moves clockwise and gives the big blind its option when everyone limps", () => {
		const limped = play(threeHanded, act(0, "call"), act(1, "call"));
		expect(stateOf(limped).toAct).toBe(2);
		expect(legalActions(stateOf(limped), 2)).toEqual({
			seat: 2,
			canFold: true,
			canCheck: true,
			callAmount: 0,
			aggression: { kind: "raise", minTo: 20, maxTo: 1000 },
		});
		expect(stateOf(play(limped, act(2, "check"))).toAct).toBeNull();
	});

	it("brings the action back to everyone who has not matched a raise", () => {
		const raised = play(
			threeHanded,
			act(0, "call"),
			act(1, "call"),
			act(2, "raise", 40),
		);
		expect(stateOf(raised).toAct).toBe(0);
		const afterCalls = play(raised, act(0, "call"));
		expect(stateOf(afterCalls).toAct).toBe(1);
		expect(stateOf(play(afterCalls, act(1, "fold"))).toAct).toBeNull();
	});

	it("ends the round when everyone else folds", () => {
		const state = stateOf(
			play(threeHanded, act(0, "raise", 30), act(1, "fold"), act(2, "fold")),
		);
		expect(state.toAct).toBeNull();
	});

	it("skips a player who is all-in", () => {
		const config = handConfig({
			players: [at(0, 1000), at(1, 1000), at(2, 1000), at(3, 50)],
		});
		// Button 0, blinds 1 and 2, seat 3 first.
		const history = play(
			start(config),
			act(3, "all-in"),
			act(0, "call"),
			act(1, "call"),
		);
		expect(stateOf(history).toAct).toBe(2);
		expect(stateOf(play(history, act(2, "call"))).toAct).toBeNull();
	});

	it("lets the first player after the button open each street, and ends when all check", () => {
		const flop = toFlop(
			play(threeHanded, act(0, "call"), act(1, "call"), act(2, "check")),
		);
		expect(stateOf(flop).toAct).toBe(1);
		expect(
			stateOf(play(flop, act(1, "check"), act(2, "check"), act(0, "check")))
				.toAct,
		).toBeNull();
		const bet = play(flop, act(1, "check"), act(2, "bet", 10), act(0, "call"));
		expect(stateOf(bet).toAct).toBe(1);
		expect(stateOf(play(bet, act(1, "call"))).toAct).toBeNull();
	});

	it("refuses to act once the round is over", () => {
		const done = play(threeHanded, act(0, "fold"), act(1, "fold"));
		given(done)
			.when(act(2, "check"))
			.then({ code: "hand.not-your-turn", params: { seat: 2 } });
	});
});

describe("player actions (RULES §7)", () => {
	it("§7 check only with nothing to call", () => {
		given(threeHanded)
			.when(act(0, "check"))
			.then({ code: "hand.illegal-check", params: { callAmount: 10 } });
	});

	it("§7 call matches the highest bet, adding only the difference after a blind", () => {
		given(threeHanded)
			.when(act(0, "call"))
			.then([acted(0, "call", 10)]);
		given(play(threeHanded, act(0, "call")))
			.when(act(1, "call"))
			.then([acted(1, "call", 5)]);
	});

	it("§7 call needs a bet to call", () => {
		const flop = toFlop(
			play(threeHanded, act(0, "call"), act(1, "call"), act(2, "check")),
		);
		given(flop).when(act(1, "call")).then({ code: "hand.nothing-to-call" });
	});

	it("§7 bet only when nobody has bet, raise only when facing a bet", () => {
		given(threeHanded)
			.when(act(0, "bet", 30))
			.then({ code: "hand.illegal-bet" });
		const flop = toFlop(
			play(threeHanded, act(0, "call"), act(1, "call"), act(2, "check")),
		);
		given(flop)
			.when(act(1, "raise", 30))
			.then({ code: "hand.illegal-raise" });
		given(flop)
			.when(act(1, "bet", 30))
			.then([acted(1, "bet", 30)]);
	});

	it("TDA 58 fold is always allowed, even when checking is free", () => {
		const limped = play(threeHanded, act(0, "call"), act(1, "call"));
		given(limped)
			.when(act(2, "fold"))
			.then([acted(2, "fold")]);
	});

	it("calls all-in for less when the stack is short of the call", () => {
		const config = handConfig({
			players: [at(0, 6), at(1, 1000), at(2, 1000)],
		});
		given(start(config))
			.when(act(0, "call"))
			.then([acted(0, "call", 6, true)]);
		given(start(config))
			.when(act(0, "all-in"))
			.then([acted(0, "call", 6, true)]);
	});
});

describe("no-limit betting (RULES §8)", () => {
	it("§8 the minimum bet is the big blind", () => {
		const flop = toFlop(
			play(threeHanded, act(0, "call"), act(1, "call"), act(2, "check")),
		);
		expect(legalActions(stateOf(flop), 1)?.aggression).toEqual({
			kind: "bet",
			minTo: 10,
			maxTo: 990,
		});
		given(flop)
			.when(act(1, "bet", 9))
			.then({ code: "hand.bet-too-small", params: { minTo: 10 } });
		given(flop)
			.when(act(1, "bet", 10))
			.then([acted(1, "bet", 10)]);
	});

	it("§8 a player with less than the big blind may bet it all", () => {
		const config = handConfig({
			players: [at(0, 1000), at(1, 1000), at(2, 1000), at(3, 17)],
		});
		const flop = toFlop(
			play(
				start(config),
				act(3, "call"),
				act(0, "call"),
				act(1, "call"),
				act(2, "check"),
			),
		);
		// Seat 3 has 7 chips left: the only bet it can make is all-in for 7.
		const history = play(flop, act(1, "check"), act(2, "check"));
		expect(legalActions(stateOf(history), 3)?.aggression).toEqual({
			kind: "bet",
			minTo: 7,
			maxTo: 7,
		});
		given(history)
			.when(act(3, "bet", 7))
			.then([acted(3, "bet", 7, true)]);
		// The short bet does not change the minimum raise: still a big blind on top of it.
		const afterShortBet = play(history, act(3, "all-in"));
		expect(legalActions(stateOf(afterShortBet), 0)?.aggression).toEqual({
			kind: "raise",
			minTo: 17,
			maxTo: 990,
		});
	});

	it("TDA 43 the minimum raise is the last full raise increment, not the total (Addendum example)", () => {
		const config = handConfig({
			smallBlind: 100,
			bigBlind: 200,
			players: players(5, 10_000),
		});
		const preflop = play(
			start(config),
			act(3, "call"),
			act(4, "call"),
			act(0, "call"),
			act(1, "call"),
			act(2, "check"),
		);
		// After the flop: A (seat 1) bets 600, B raises to 1,600, C re-raises to 3,600.
		const history = play(
			toFlop(preflop),
			act(1, "bet", 600),
			act(2, "raise", 1600),
			act(3, "raise", 3600),
		);
		expect(legalActions(stateOf(history), 4)?.aggression?.minTo).toBe(5600);
		given(history)
			.when(act(4, "raise", 5599))
			.then({ code: "hand.raise-too-small", params: { minTo: 5600 } });
		given(history)
			.when(act(4, "raise", 5600))
			.then([acted(4, "raise", 5600)]);
	});

	it("TDA 43 a short all-in does not raise the minimum (Addendum example 1)", () => {
		const config = handConfig({
			smallBlind: 50,
			bigBlind: 100,
			players: [at(0, 1000), at(1, 1000), at(2, 1000), at(3, 150)],
		});
		const history = play(start(config), act(3, "all-in"));
		expect(history.at(-1)).toEqual(acted(3, "raise", 150, true));
		expect(legalActions(stateOf(history), 0)?.aggression?.minTo).toBe(250);
	});

	it("TDA 43-B a raise amount is the total bet, not the increase", () => {
		const history = play(threeHanded, act(0, "raise", 30), act(1, "raise", 80));
		expect(history.at(-1)).toEqual(acted(1, "raise", 75));
		expect(stateOf(history).currentBet).toBe(80);
	});

	it("§8 the maximum bet is all the player's chips", () => {
		given(threeHanded)
			.when(act(0, "raise", 1001))
			.then({ code: "hand.insufficient-chips", params: { maxTo: 1000 } });
		given(threeHanded)
			.when(act(0, "raise", 1000))
			.then([acted(0, "raise", 1000, true)]);
		given(threeHanded)
			.when(act(0, "all-in"))
			.then([acted(0, "raise", 1000, true)]);
	});

	it("TDA 48 there is no limit on the number of raises", () => {
		// Heads-up: the button (seat 0) acts first preflop; the two players re-raise 20 times.
		let history = start(handConfig({ players: players(2), buttonSeat: 0 }));
		for (let raise = 1; raise <= 20; raise++) {
			history = play(
				history,
				act(raise % 2 === 1 ? 0 : 1, "raise", 10 + raise * 10),
			);
		}
		expect(stateOf(history)).toMatchObject({ currentBet: 210, toAct: 0 });
	});

	it("TDA 52-A an underraise is refused; the client must send at least the minimum", () => {
		given(threeHanded)
			.when(act(0, "raise", 15))
			.then({ code: "hand.raise-too-small", params: { minTo: 20 } });
	});

	it("TDA 40, 42, 43-A, 44, 45, 56 (live chip handling): online every action names its kind and total", () => {
		// No chips are pushed online, so there are no string bets, oversized chips or 50% rule: a raise
		// below the minimum is refused, never reinterpreted as a call, and a call is always a call.
		given(threeHanded)
			.when(act(0, "raise", 15))
			.then({ code: "hand.raise-too-small", params: { minTo: 20 } });
		given(threeHanded)
			.when(act(0, "call", 500))
			.then([acted(0, "call", 10)]);
	});

	it.each([25.5, Number.NaN, undefined])(
		"refuses a bet or raise to %s",
		(amount) => {
			given(threeHanded)
				.when(act(0, "raise", amount))
				.then({ code: "hand.invalid-amount" });
		},
	);

	it("allows no raise when every opponent is all-in: only call or fold", () => {
		// Heads-up, the big blind is all-in with 10 chips.
		const config = handConfig({
			players: [at(0, 1000), at(1, 10)],
			buttonSeat: 0,
		});
		const history = start(config);
		expect(legalActions(stateOf(history), 0)).toEqual({
			seat: 0,
			canFold: true,
			canCheck: false,
			callAmount: 5,
			aggression: null,
		});
		given(history)
			.when(act(0, "raise", 30))
			.then({ code: "hand.raise-not-allowed" });
		given(history)
			.when(act(0, "all-in"))
			.then({ code: "hand.raise-not-allowed" });
		expect(stateOf(play(history, act(0, "call"))).toAct).toBeNull();
	});
});

describe("Timeout", () => {
	it("checks when that is free and folds otherwise, marked as automatic", () => {
		given(threeHanded)
			.when({ type: "Timeout", seat: 0 })
			.then([{ ...acted(0, "fold"), auto: true }]);
		given(play(threeHanded, act(0, "call"), act(1, "call")))
			.when({ type: "Timeout", seat: 2 })
			.then([{ ...acted(2, "check"), auto: true }]);
	});

	it("refuses a stale timeout for a player who is not to act", () => {
		given(threeHanded)
			.when({ type: "Timeout", seat: 2 })
			.then({ code: "hand.not-your-turn", params: { seat: 2 } });
	});
});
