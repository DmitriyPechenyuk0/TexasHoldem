import { given, play } from "../testing/hand-harness.js";
import { handConfig, holeCards, riggedDeck } from "../testing/hand-fixtures.js";
import { legalActions } from "./betting.js";
import type { ActionKind, HandCommand } from "./commands.js";
import type { HandConfig } from "./config.js";
import type { HandEvent } from "./events.js";
import { replayHand } from "./evolve.js";
import type { ActiveHand } from "./state.js";

// RULES §10 (showdown) and §12 (splitting pots), TDA 16, 17, 20 and 21.

const act = (seat: number, action: ActionKind, amount?: number): HandCommand =>
	amount === undefined
		? { type: "Act", seat, action }
		: { type: "Act", seat, action, amount };

const stateOf = (events: readonly HandEvent[]) =>
	replayHand(events) as ActiveHand;

const shown = (seat: number, cards: string): HandEvent => ({
	type: "CardsShown",
	v: 1,
	seat,
	cards: holeCards(cards),
});
const mucked = (seat: number): HandEvent => ({
	type: "CardsMucked",
	v: 1,
	seat,
});
const showdown: HandEvent = { type: "ShowdownStarted", v: 1 };

/** Pot `pot` won by these winners, as [seat, amount]. */
const awarded = (pot: number, ...winners: [number, number][]): HandEvent => ({
	type: "PotAwarded",
	v: 1,
	pot,
	winners: winners.map(([seat, amount]) => ({ seat, amount })),
});

/** Seats 0, 1, 2… end the hand with these stacks. */
const ended = (...stacks: number[]): HandEvent => ({
	type: "HandEnded",
	v: 1,
	stacks: stacks.map((stack, seat) => ({ seat, stack })),
});

/** Three-handed 5/10 with these hole cards and board; button 0, blinds 1 and 2. */
const table = (
	hands: Record<number, string>,
	board: string,
	overrides: Partial<HandConfig> = {},
) => handConfig({ deck: riggedDeck(hands, board), ...overrides });

const start = (config: HandConfig) => play([], { type: "StartHand", config });
const checkAround = [act(1, "check"), act(2, "check"), act(0, "check")];

/** Everyone limps, then checks the flop and the turn: 30 in the pot, seat 1 first on the river. */
const toRiver = (config: HandConfig) =>
	play(
		start(config),
		act(0, "call"),
		act(1, "call"),
		act(2, "check"),
		...checkAround,
		...checkAround,
	);

// Aces beat kings beat nothing on this board.
const board = "Ah Kh 3c 8d 9s";

describe("showing order (TDA 17)", () => {
	it("the last to bet on the river shows first, then every hand that can win is turned up", () => {
		const river = toRiver(table({ 0: "As Ad", 1: "Kc Kd", 2: "7h 2s" }, board));
		given(play(river, act(1, "bet", 50), act(2, "fold")))
			.when(act(0, "call"))
			.then([
				{
					type: "PlayerActed",
					v: 1,
					seat: 0,
					action: "call",
					amount: 50,
					allIn: false,
				},
				{
					type: "PotsCollected",
					v: 1,
					pots: [{ amount: 130, eligibleSeats: [0, 1] }],
				},
				showdown,
				shown(1, "Kc Kd"),
				shown(0, "As Ad"),
				awarded(0, [0, 130]),
				ended(1070, 940, 990),
			]);
	});

	describe("with no bet on the river", () => {
		// Seat 1, first left of the button, shows aces; kings and nothing behind it can only lose.
		const river = toRiver(table({ 0: "7h 2s", 1: "As Ad", 2: "Kc Kd" }, board));
		const checkedDown = play(river, act(1, "check"), act(2, "check"));
		const atShowdown = play(checkedDown, act(0, "check"));

		it("the first player left of the button shows first, and a beaten hand gets the turn", () => {
			given(checkedDown)
				.when(act(0, "check"))
				.then([
					{
						type: "PlayerActed",
						v: 1,
						seat: 0,
						action: "check",
						amount: 0,
						allIn: false,
					},
					showdown,
					shown(1, "As Ad"),
				]);
			expect(stateOf(atShowdown)).toMatchObject({
				street: "showdown",
				toAct: 2,
			});
		});

		it("beaten players muck in turn, and the pot goes to the hand shown", () => {
			const afterFirstMuck = given(atShowdown)
				.when({ type: "MuckCards", seat: 2 })
				.then([mucked(2)]);
			expect((afterFirstMuck as ActiveHand).toAct).toBe(0);
			given(play(atShowdown, { type: "MuckCards", seat: 2 }))
				.when({ type: "MuckCards", seat: 0 })
				.then([mucked(0), awarded(0, [1, 30]), ended(990, 1020, 990)]);
		});

		it("a beaten player may show instead of mucking", () => {
			given(atShowdown)
				.when({ type: "ShowCards", seat: 2 })
				.then([shown(2, "Kc Kd")]);
		});

		it("the turn timer mucks for a player who does not choose", () => {
			given(atShowdown)
				.when({ type: "Timeout", seat: 2 })
				.then([{ type: "CardsMucked", v: 1, seat: 2, auto: true }]);
		});

		it("anyone still in may show out of turn, but mucks only on their turn", () => {
			const shownEarly = given(atShowdown)
				.when({ type: "ShowCards", seat: 0 })
				.then([shown(0, "7h 2s")]);
			expect((shownEarly as ActiveHand).toAct).toBe(2);
			given(atShowdown)
				.when({ type: "MuckCards", seat: 0 })
				.then({ code: "hand.not-your-turn", params: { seat: 0 } });
		});

		it("takes no betting actions and no stale timeouts at the showdown", () => {
			given(atShowdown)
				.when(act(2, "check"))
				.then({ code: "hand.betting-over" });
			given(atShowdown)
				.when({ type: "Timeout", seat: 0 })
				.then({ code: "hand.not-your-turn", params: { seat: 0 } });
			expect(legalActions(stateOf(atShowdown), 2)).toBeNull();
		});
	});
});

describe("winners and split pots (RULES §12, TDA 20, 21)", () => {
	it("splits a tie equally, and the odd chip goes to the first winner left of the button", () => {
		// Antes make the pot 33. Seats 0 and 1 both have the ace-high straight; seat 2 mucks nines.
		const river = toRiver(
			table({ 0: "Td 3c", 1: "Tc 4d", 2: "9h 9s" }, "Ah Kh Qd Jc 2s", {
				ante: 1,
			}),
		);
		const atShowdown = play(river, ...checkAround);
		expect(atShowdown.slice(-2)).toEqual([showdown, shown(1, "Tc 4d")]);
		given(atShowdown)
			.when({ type: "MuckCards", seat: 2 })
			.then([
				mucked(2),
				shown(0, "Td 3c"),
				awarded(0, [1, 17], [0, 16]),
				ended(1005, 1006, 989),
			]);
	});

	it("awards the side pot first, and each pot to the best hand that can win it", () => {
		// Seat 0 is all-in for 100 with aces, seat 1 for 300 with kings, and seat 2 calls with nothing.
		const config = table({ 0: "As Ad", 1: "Kc Kd", 2: "7h 2s" }, board, {
			players: [
				{ seat: 0, playerId: "p0", stack: 100 },
				{ seat: 1, playerId: "p1", stack: 300 },
				{ seat: 2, playerId: "p2", stack: 1000 },
			],
		});
		const { decision } = given(
			play(start(config), act(0, "all-in"), act(1, "all-in")),
		).when(act(2, "call"));
		const events = decision.ok ? decision.events : [];
		// TDA 16: all three hands, the worst included, are turned up before the board is dealt.
		expect(events.filter((event) => event.type !== "StreetDealt")).toEqual([
			{
				type: "PlayerActed",
				v: 1,
				seat: 2,
				action: "call",
				amount: 290,
				allIn: false,
			},
			{
				type: "PotsCollected",
				v: 1,
				pots: [
					{ amount: 300, eligibleSeats: [0, 1, 2] },
					{ amount: 400, eligibleSeats: [1, 2] },
				],
			},
			shown(1, "Kc Kd"),
			shown(2, "7h 2s"),
			shown(0, "As Ad"),
			showdown,
			awarded(1, [1, 400]),
			awarded(0, [0, 300]),
			ended(300, 400, 700),
		]);
		expect(events.map((event) => event.type).indexOf("StreetDealt")).toBe(5);
	});

	it("TDA 16: with a player all-in, every hand is turned up at the showdown, none mucked", () => {
		// Seat 0 is all-in preflop; the other two could still bet but check it down.
		const config = table({ 0: "As Ad", 1: "Kc Kd", 2: "7h 2s" }, board, {
			players: [
				{ seat: 0, playerId: "p0", stack: 100 },
				{ seat: 1, playerId: "p1", stack: 1000 },
				{ seat: 2, playerId: "p2", stack: 1000 },
			],
		});
		const river = play(
			start(config),
			act(0, "all-in"),
			act(1, "call"),
			act(2, "call"),
			...[1, 2, 1, 2, 1].map((seat) => act(seat, "check")),
		);
		given(river)
			.when(act(2, "check"))
			.then([
				{
					type: "PlayerActed",
					v: 1,
					seat: 2,
					action: "check",
					amount: 0,
					allIn: false,
				},
				showdown,
				shown(1, "Kc Kd"),
				shown(2, "7h 2s"),
				shown(0, "As Ad"),
				awarded(0, [0, 300]),
				ended(300, 900, 900),
			]);
	});

	it("TDA Addendum, Rule 16: hands are turned up only once nobody can bet any more", () => {
		// A is all-in preflop and B and C call; on the turn B is all-in and C calls.
		const config = table({ 0: "As Ad", 1: "Kc Kd", 2: "7h 2s" }, board, {
			players: [
				{ seat: 0, playerId: "p0", stack: 100 },
				{ seat: 1, playerId: "p1", stack: 500 },
				{ seat: 2, playerId: "p2", stack: 1000 },
			],
		});
		const turn = play(
			start(config),
			act(0, "all-in"),
			act(1, "call"),
			act(2, "call"),
			act(1, "check"),
			act(2, "check"),
		);
		expect(turn.some((event) => event.type === "CardsShown")).toBe(false);
		const { decision } = given(play(turn, act(1, "all-in"))).when(
			act(2, "call"),
		);
		expect(decision.ok && decision.events.map((event) => event.type)).toEqual([
			"PlayerActed",
			"PotsCollected",
			"CardsShown",
			"CardsShown",
			"CardsShown",
			"StreetDealt",
			"ShowdownStarted",
			"PotAwarded",
			"PotAwarded",
			"HandEnded",
		]);
	});
});
