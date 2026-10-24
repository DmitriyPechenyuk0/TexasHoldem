import type { Card } from "../cards/index.js";
import { given, play } from "../testing/hand-harness.js";
import { handConfig, handStarted, players } from "../testing/hand-fixtures.js";
import type { ActionKind, HandCommand } from "./commands.js";
import type { HandConfig } from "./config.js";
import type { HandEvent, Street } from "./events.js";
import { replayHand } from "./evolve.js";
import type { ActiveHand } from "./state.js";

// RULES §5 (dealing a hand), §6 (betting rounds) and §9 (uncalled bets). The fixture deck is
// unshuffled, so the card at deck position i is simply card i: burns and board cards show by number.

const card = (position: number) => position as Card;

const act = (seat: number, action: ActionKind, amount?: number): HandCommand =>
	amount === undefined
		? { type: "Act", seat, action }
		: { type: "Act", seat, action, amount };

const acted = (
	seat: number,
	action: "fold" | "check" | "call" | "bet" | "raise",
	amount = 0,
	allIn = false,
): HandEvent => ({ type: "PlayerActed", v: 1, seat, action, amount, allIn });

const returned = (seat: number, amount: number): HandEvent => ({
	type: "UncalledBetReturned",
	v: 1,
	seat,
	amount,
});

const collected = (amount: number, eligibleSeats: number[]): HandEvent => ({
	type: "PotsCollected",
	v: 1,
	pots: [{ amount, eligibleSeats }],
});

const dealt = (
	street: Exclude<Street, "preflop">,
	burn: number,
	...cards: number[]
): HandEvent => ({
	type: "StreetDealt",
	v: 1,
	street,
	burn: card(burn),
	cards: cards.map(card),
});

const showdown: HandEvent = { type: "ShowdownStarted", v: 1 };

const awarded = (seat: number, amount: number): HandEvent => ({
	type: "PotAwarded",
	v: 1,
	pot: 0,
	winners: [{ seat, amount }],
});

/** Pot 0 split between these winners, as [seat, amount], clockwise from the button. */
const split = (...winners: [number, number][]): HandEvent => ({
	type: "PotAwarded",
	v: 1,
	pot: 0,
	winners: winners.map(([seat, amount]) => ({ seat, amount })),
});

/** The player turns up the cards at these deck positions. */
const shown = (seat: number, first: number, second: number): HandEvent => ({
	type: "CardsShown",
	v: 1,
	seat,
	cards: [card(first), card(second)],
});

/** Seats 0, 1, 2… end the hand with these stacks. */
const ended = (...stacks: number[]): HandEvent => ({
	type: "HandEnded",
	v: 1,
	stacks: stacks.map((stack, seat) => ({ seat, stack })),
});

const stateOf = (events: readonly HandEvent[]) =>
	replayHand(events) as ActiveHand;
const start = (config: HandConfig) => play([], { type: "StartHand", config });

// Three-handed 5/10, 1,000 chips each: button 0, small blind 1, big blind 2. Hole cards take deck
// positions 0–5, so the flop burns 6 and shows 7–9, the turn burns 10 for 11, the river 12 for 13.
const threeHanded = start(handConfig());
const limped = play(threeHanded, act(0, "call"), act(1, "call"));
const flop = play(limped, act(2, "check"));
const checkAround = [act(1, "check"), act(2, "check"), act(0, "check")];
const turn = play(flop, ...checkAround);
const river = play(turn, ...checkAround);

// Heads-up, button 0 posts the small blind. Hole cards take 0–3 (seat 1 gets 0 and 2, the button
// 1 and 3): the flop burns 4 and shows 5–7, the turn burns 8 for 9, the river burns 10 for 11. Both
// players then play the board's full house, so every heads-up showdown here is a split.
const headsUp = (
	stacks: [number, number],
	overrides: Partial<HandConfig> = {},
) =>
	handConfig({
		buttonSeat: 0,
		players: stacks.map((stack, seat) => ({
			seat,
			playerId: `p${seat}`,
			stack,
		})),
		...overrides,
	});
const headsUpRunOut = [
	dealt("flop", 4, 5, 6, 7),
	dealt("turn", 8, 9),
	dealt("river", 10, 11),
	showdown,
];

describe("closing a betting round (RULES §5, §6)", () => {
	it("collects the bets, burns one card and deals the flop", () => {
		given(limped)
			.when(act(2, "check"))
			.then([
				acted(2, "check"),
				collected(30, [0, 1, 2]),
				dealt("flop", 6, 7, 8, 9),
			]);
		expect(stateOf(flop)).toMatchObject({
			street: "flop",
			board: [7, 8, 9],
			nextCard: 10,
			toAct: 1,
		});
	});

	it("burns a card before the turn and before the river", () => {
		given(play(flop, act(1, "check"), act(2, "check")))
			.when(act(0, "check"))
			.then([acted(0, "check"), dealt("turn", 10, 11)]);
		given(play(turn, act(1, "check"), act(2, "check")))
			.when(act(0, "check"))
			.then([acted(0, "check"), dealt("river", 12, 13)]);
	});

	it("goes to the showdown when the river betting ends with two or more players", () => {
		// Nobody bet, so the order starts left of the button. Seat 1 has fours full of twos; seats
		// 2 and 0 both have fours full of threes and split the pot.
		given(play(river, act(1, "check"), act(2, "check")))
			.when(act(0, "check"))
			.then([
				acted(0, "check"),
				showdown,
				shown(1, 0, 3),
				shown(2, 1, 4),
				shown(0, 2, 5),
				split([2, 15], [0, 15]),
				ended(1005, 990, 1005),
			]);
		const state = stateOf(play(river, ...checkAround));
		expect(state).toMatchObject({
			status: "ended",
			street: "showdown",
			board: [7, 8, 9, 11, 13],
			nextCard: 14,
			toAct: null,
		});
	});

	it("collects a later street's bets on top of the pot", () => {
		given(play(flop, act(1, "bet", 20), act(2, "call")))
			.when(act(0, "call"))
			.then([
				acted(0, "call", 20),
				collected(90, [0, 1, 2]),
				dealt("turn", 10, 11),
			]);
	});

	it("leaves a folded player's chips in the pot, but not their eligibility", () => {
		given(play(flop, act(1, "bet", 20), act(2, "fold")))
			.when(act(0, "call"))
			.then([
				acted(0, "call", 20),
				collected(70, [0, 1]),
				dealt("turn", 10, 11),
			]);
	});
});

describe("everyone else folds (RULES §5, TDA 17-B)", () => {
	it("preflop: the raiser gets back the part nobody called and wins the blinds", () => {
		given(play(threeHanded, act(0, "raise", 30), act(1, "fold")))
			.when(act(2, "fold"))
			.then([
				acted(2, "fold"),
				returned(0, 20),
				collected(25, [0]),
				awarded(0, 25),
				ended(1015, 995, 990),
			]);
	});

	it("preflop: the big blind wins when everyone folds to it", () => {
		given(play(threeHanded, act(0, "fold")))
			.when(act(1, "fold"))
			.then([
				acted(1, "fold"),
				returned(2, 5),
				collected(10, [2]),
				awarded(2, 10),
				ended(1000, 995, 1005),
			]);
	});

	it.each([
		["flop", flop],
		["turn", turn],
		["river", river],
	])(
		"%s: an uncalled bet goes back and the bettor wins the pot",
		(_, history) => {
			// With the bet back, the 30 from preflop is the pot, now only for the bettor.
			given(play(history, act(1, "bet", 50), act(2, "fold")))
				.when(act(0, "fold"))
				.then([
					acted(0, "fold"),
					returned(1, 50),
					collected(30, [1]),
					awarded(1, 30),
					ended(990, 1020, 990),
				]);
		},
	);

	it("collects the called part of the street before awarding the pot", () => {
		// Seat 1 bets 50 and seat 2 calls; seat 0 raises to 200 and both fold. 150 goes back.
		given(
			play(
				flop,
				act(1, "bet", 50),
				act(2, "call"),
				act(0, "raise", 200),
				act(1, "fold"),
			),
		)
			.when(act(2, "fold"))
			.then([
				acted(2, "fold"),
				returned(0, 150),
				collected(180, [0]),
				awarded(0, 180),
				ended(1120, 940, 940),
			]);
	});

	it("a fold when checking is free ends the hand too", () => {
		// Heads-up the big blind (seat 1) acts first after the flop.
		const headsUpFlop = play(
			start(headsUp([1000, 1000])),
			act(0, "call"),
			act(1, "check"),
		);
		given(headsUpFlop)
			.when(act(1, "fold"))
			.then([
				acted(1, "fold"),
				collected(20, [0]),
				awarded(0, 20),
				ended(1010, 990),
			]);
	});

	it("takes no further commands once the hand has ended", () => {
		const done = play(threeHanded, act(0, "fold"), act(1, "fold"));
		expect(stateOf(done).status).toBe("ended");
		given(done).when({ type: "Timeout", seat: 2 }).then({ code: "hand.over" });
	});
});

describe("all-in run-out (RULES §10, TDA 16)", () => {
	it("deals every street without betting once both players are all-in preflop", () => {
		given(play(start(headsUp([1000, 1000])), act(0, "all-in")))
			.when(act(1, "call"))
			.then([
				acted(1, "call", 990, true),
				collected(2000, [0, 1]),
				// The raiser shows first, both before the board comes.
				shown(0, 1, 3),
				shown(1, 0, 2),
				...headsUpRunOut,
				split([1, 1000], [0, 1000]),
				ended(1000, 1000),
			]);
	});

	it("returns what the shorter stack could not call, then runs the board out", () => {
		const history = play(start(headsUp([1000, 400])), act(0, "all-in"));
		given(history)
			.when(act(1, "call"))
			.then([
				acted(1, "call", 390, true),
				returned(0, 600),
				collected(800, [0, 1]),
				shown(0, 1, 3),
				shown(1, 0, 2),
				...headsUpRunOut,
				split([1, 400], [0, 400]),
				ended(1000, 400),
			]);
	});

	it("runs the board out from the start when the blinds put everyone all-in", () => {
		const config = headsUp([5, 10]);
		given([])
			.when({ type: "StartHand", config })
			.then([
				handStarted(config),
				{
					type: "BlindPosted",
					v: 1,
					seat: 0,
					blind: "small",
					amount: 5,
					allIn: true,
				},
				{
					type: "BlindPosted",
					v: 1,
					seat: 1,
					blind: "big",
					amount: 10,
					allIn: true,
				},
				{
					type: "HoleCardsDealt",
					v: 1,
					hands: [
						{ seat: 1, cards: [card(0), card(2)] },
						{ seat: 0, cards: [card(1), card(3)] },
					],
				},
				returned(1, 5),
				collected(10, [0, 1]),
				shown(1, 0, 2),
				shown(0, 1, 3),
				...headsUpRunOut,
				split([1, 5], [0, 5]),
				ended(5, 10),
			]);
	});

	it("collects the antes when they leave nobody able to post a blind", () => {
		const config = headsUp([10, 10], { ante: 10 });
		const { decision } = given([]).when({ type: "StartHand", config });
		expect(decision.ok && decision.events.slice(3)).toEqual([
			{
				type: "HoleCardsDealt",
				v: 1,
				hands: [
					{ seat: 1, cards: [card(0), card(2)] },
					{ seat: 0, cards: [card(1), card(3)] },
				],
			},
			collected(20, [0, 1]),
			shown(1, 0, 2),
			shown(0, 1, 3),
			...headsUpRunOut,
			split([1, 10], [0, 10]),
			ended(10, 10),
		]);
	});

	it("runs out only the streets still to come when the betting stops on the turn", () => {
		const headsUpTurn = play(
			start(headsUp([1000, 1000])),
			act(0, "call"),
			act(1, "check"),
			act(1, "check"),
			act(0, "check"),
			act(1, "all-in"),
		);
		given(headsUpTurn)
			.when(act(0, "call"))
			.then([
				acted(0, "call", 990, true),
				collected(2000, [0, 1]),
				shown(1, 0, 2),
				shown(0, 1, 3),
				dealt("river", 10, 11),
				showdown,
				split([1, 1000], [0, 1000]),
				ended(1000, 1000),
			]);
	});

	it("keeps the betting going while two players can still bet (TDA Addendum, Rule 16)", () => {
		// The short stack is all-in preflop, but the two callers still bet on the flop.
		const config = handConfig({
			players: [
				{ seat: 0, playerId: "p0", stack: 100 },
				...players(3).slice(1),
			],
		});
		const history = play(
			start(config),
			act(0, "all-in"),
			act(1, "call"),
			act(2, "call"),
		);
		expect(stateOf(history)).toMatchObject({ street: "flop", toAct: 1 });
		expect(history.at(-2)).toEqual(collected(300, [0, 1, 2]));
	});
});

describe("side pots (RULES §9)", () => {
	// Seat 0 is all-in for 100 preflop and both blinds call: one pot of 300, then the flop.
	const shortStack = handConfig({
		players: [{ seat: 0, playerId: "p0", stack: 100 }, ...players(3).slice(1)],
	});
	const allInCalled = play(
		start(shortStack),
		act(0, "all-in"),
		act(1, "call"),
		act(2, "call"),
	);

	it("puts what the others bet above the all-in into a side pot", () => {
		given(play(allInCalled, act(1, "bet", 100)))
			.when(act(2, "call"))
			.then([
				acted(2, "call", 100),
				{
					type: "PotsCollected",
					v: 1,
					pots: [
						{ amount: 300, eligibleSeats: [0, 1, 2] },
						{ amount: 200, eligibleSeats: [1, 2] },
					],
				},
				dealt("turn", 10, 11),
			]);
	});

	it("rebuilds the pots when a player folds, then runs out once only one can bet", () => {
		// The bet is uncalled and goes back; seat 2's 100 stays in the main pot it can no longer win.
		given(play(allInCalled, act(1, "bet", 100)))
			.when(act(2, "fold"))
			.then([
				acted(2, "fold"),
				returned(1, 100),
				collected(300, [0, 1]),
				shown(1, 0, 3),
				shown(0, 2, 5),
				dealt("turn", 10, 11),
				dealt("river", 12, 13),
				showdown,
				// Fours full of threes beat fours full of twos.
				awarded(0, 300),
				ended(300, 900, 900),
			]);
	});
});
