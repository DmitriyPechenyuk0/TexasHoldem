import type { Card } from "../cards/index.js";
import { given } from "../testing/hand-harness.js";
import {
	handConfig,
	handStarted,
	holeCards,
	players,
} from "../testing/hand-fixtures.js";
import type { HandCommand } from "./commands.js";
import type { HandConfig } from "./config.js";
import { decide } from "./decide.js";
import type { InvalidConfigReason } from "./errors.js";
import type { HandEvent } from "./events.js";
import { replayHand } from "./evolve.js";

const aceKing = holeCards("As Kd");

/**
 * Three players dealt in, then a showdown between seats 1 and 2 (seat 0 folded). No pots were
 * collected, so nobody has a pot to win and the showdown just waits for seat 1, then seat 2.
 */
const atShowdown: HandEvent[] = [
	handStarted(),
	{
		type: "HoleCardsDealt",
		v: 1,
		hands: [
			{ seat: 1, cards: aceKing },
			{ seat: 2, cards: holeCards("Qc Qh") },
			{ seat: 0, cards: holeCards("2c 7d") },
		],
	},
	{
		type: "PlayerActed",
		v: 1,
		seat: 0,
		action: "fold",
		amount: 0,
		allIn: false,
	},
	{ type: "ShowdownStarted", v: 1 },
];

describe("StartHand", () => {
	it("records the config in HandStarted, with the players in seat order", () => {
		const config = handConfig({ players: [...players(3)].reverse() });
		const { decision } = given([]).when({ type: "StartHand", config });
		expect(decision.ok && decision.events[0]).toEqual(
			handStarted(handConfig()),
		);
	});

	it("cannot start twice", () => {
		given([handStarted()])
			.when({ type: "StartHand", config: handConfig() })
			.then({ code: "hand.already-started" });
	});

	it.each<[InvalidConfigReason, Partial<HandConfig>]>([
		["player-count", { players: players(1) }],
		["player-count", { players: players(11) }],
		[
			"seats",
			{ players: [...players(2), { seat: 1, playerId: "p9", stack: 10 }] },
		],
		[
			"seats",
			{
				players: [
					{ seat: -1, playerId: "a", stack: 10 },
					...players(2).slice(1),
				],
			},
		],
		[
			"seats",
			{
				players: [
					{ seat: 0.5, playerId: "a", stack: 10 },
					...players(2).slice(1),
				],
			},
		],
		[
			"player-ids",
			{
				players: [
					{ seat: 0, playerId: "p1", stack: 10 },
					...players(2).slice(1),
				],
			},
		],
		[
			"player-ids",
			{
				players: [{ seat: 0, playerId: "", stack: 10 }, ...players(2).slice(1)],
			},
		],
		[
			"stacks",
			{
				players: [
					{ seat: 0, playerId: "p0", stack: 0 },
					...players(2).slice(1),
				],
			},
		],
		[
			"stacks",
			{
				players: [
					{ seat: 0, playerId: "p0", stack: 2.5 },
					...players(2).slice(1),
				],
			},
		],
		["blinds", { smallBlind: 0 }],
		["blinds", { bigBlind: 0 }],
		["blinds", { smallBlind: 20, bigBlind: 10 }],
		["ante", { ante: -1 }],
		["button", { buttonSeat: -1 }],
		["button", { players: players(2), buttonSeat: 5 }],
		["blind-seats", { smallBlindSeat: -1 }],
		["blind-seats", { bigBlindSeat: 1.5 }],
		["blind-seats", { smallBlindSeat: 2, bigBlindSeat: 1 }],
		["blind-seats", { bigBlindSeat: 0 }],
		[
			"blind-seats",
			{
				players: players(2),
				buttonSeat: 0,
				smallBlindSeat: 1,
				bigBlindSeat: 0,
			},
		],
		// Players at 0, 3 and 4: a dead small blind must sit between the button and the big blind.
		[
			"blind-seats",
			{
				players: [0, 3, 4].map((seat) => ({
					seat,
					playerId: `p${seat}`,
					stack: 10,
				})),
				smallBlindSeat: 5,
				bigBlindSeat: 3,
			},
		],
		[
			"blind-seats",
			{
				players: [0, 3, 4].map((seat) => ({
					seat,
					playerId: `p${seat}`,
					stack: 10,
				})),
				smallBlindSeat: 2,
				bigBlindSeat: 4,
			},
		],
		["deck", { deck: handConfig().deck.slice(1) }],
		["deck", { deck: [...handConfig().deck.slice(1), 1 as Card] }],
		["deck", { deck: [...handConfig().deck.slice(1), 52 as Card] }],
	])("rejects a config with bad %s", (reason, overrides) => {
		given([])
			.when({ type: "StartHand", config: handConfig(overrides) })
			.then({ code: "hand.invalid-config", params: { reason } });
	});

	it("accepts the edge of every limit", () => {
		const config = handConfig({
			players: players(10, 1),
			smallBlind: 10,
			bigBlind: 10,
			ante: 10,
			buttonSeat: 42,
		});
		const { decision } = given([]).when({ type: "StartHand", config });
		expect(decision.ok && decision.events[0]).toEqual(handStarted(config));
	});
});

describe("commands before, during and after a hand", () => {
	const turnCommands: HandCommand[] = [
		{ type: "Act", seat: 1, action: "call" },
		{ type: "Timeout", seat: 1 },
	];
	const showdownCommands: HandCommand[] = [
		{ type: "ShowCards", seat: 1 },
		{ type: "MuckCards", seat: 1 },
	];

	it.each([...turnCommands, ...showdownCommands])(
		"rejects $type before the hand starts",
		(command) => {
			given([])
				.when(command)
				.then({ code: "hand.not-started", params: { command: command.type } });
		},
	);

	it.each(turnCommands)("rejects $type while nobody is to act", (command) => {
		given([handStarted()])
			.when(command)
			.then({ code: "hand.not-your-turn", params: { seat: 1 } });
	});

	it.each(showdownCommands)("rejects $type before the showdown", (command) => {
		given([handStarted()])
			.when(command)
			.then({ code: "hand.showdown-not-reached", params: { seat: 1 } });
	});

	it.each([...turnCommands, ...showdownCommands])(
		"rejects $type once the hand is over",
		(command) => {
			given([handStarted(), { type: "HandEnded", v: 1, stacks: [] }])
				.when(command)
				.then({ code: "hand.over" });
		},
	);
});

describe("ShowCards and MuckCards at the showdown", () => {
	it("shows a player's hole cards", () => {
		given(atShowdown)
			.when({ type: "ShowCards", seat: 1 })
			.then([{ type: "CardsShown", v: 1, seat: 1, cards: aceKing }]);
	});

	it("mucks a player's hand on their turn, and only then", () => {
		given(atShowdown)
			.when({ type: "MuckCards", seat: 1 })
			.then([{ type: "CardsMucked", v: 1, seat: 1 }]);
		given(atShowdown)
			.when({ type: "MuckCards", seat: 2 })
			.then({ code: "hand.not-your-turn", params: { seat: 2 } });
	});

	it.each([
		["a folded player", atShowdown, 0],
		["a seat nobody holds", atShowdown, 7],
		[
			"a player who already mucked",
			[...atShowdown, { type: "CardsMucked", v: 1, seat: 2 } as const],
			2,
		],
		["a player never dealt cards", [atShowdown[0]!, atShowdown[3]!], 1],
	])("refuses %s", (_, history, seat) => {
		given(history as HandEvent[])
			.when({ type: "ShowCards", seat })
			.then({ code: "hand.player-not-in-hand", params: { seat } });
	});

	it("refuses to show or muck cards already shown", () => {
		const history: HandEvent[] = [
			...atShowdown,
			{ type: "CardsShown", v: 1, seat: 1, cards: aceKing },
		];
		for (const type of ["ShowCards", "MuckCards"] as const) {
			given(history)
				.when({ type, seat: 1 })
				.then({ code: "hand.cards-already-shown", params: { seat: 1 } });
		}
	});
});

it("never changes the state it decides on", () => {
	const state = replayHand(atShowdown);
	const before = structuredClone(state);
	decide({ type: "ShowCards", seat: 1 }, state);
	decide({ type: "StartHand", config: handConfig() }, state);
	expect(state).toEqual(before);
});
