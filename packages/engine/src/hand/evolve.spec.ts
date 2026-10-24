import { formatCards } from "../cards/index.js";
import {
	handConfig,
	handStarted,
	holeCards,
	players,
} from "../testing/hand-fixtures.js";
import type { HandEvent } from "./events.js";
import { evolve, replayHand } from "./evolve.js";
import { type ActiveHand, type HandState, initialHandState } from "./state.js";

const config = handConfig({ ante: 1, players: players(3, 100) });

/** Follows a whole three-handed hand, one event at a time. */
function play(...events: HandEvent[]): ActiveHand {
	return replayHand([handStarted(config), ...events]) as ActiveHand;
}

const seat = (state: ActiveHand, index: number) =>
	state.players.find((player) => player.seat === index)!;

/** Every chip is behind a player, in front of one this street, or already in a pot. */
const chipsInPlay = (state: ActiveHand) =>
	state.players.reduce(
		(sum, player) => sum + player.stack + player.committed,
		0,
	);

const antes: HandEvent[] = [0, 1, 2].map((index) => ({
	type: "AntePosted",
	v: 1,
	seat: index,
	amount: 1,
	allIn: false,
}));
const blinds: HandEvent[] = [
	{
		type: "BlindPosted",
		v: 1,
		seat: 1,
		blind: "small",
		amount: 5,
		allIn: false,
	},
	{
		type: "BlindPosted",
		v: 1,
		seat: 2,
		blind: "big",
		amount: 10,
		allIn: false,
	},
];
const dealt: HandEvent = {
	type: "HoleCardsDealt",
	v: 1,
	hands: [
		{ seat: 1, cards: holeCards("2c 2d") },
		{ seat: 2, cards: holeCards("2h 2s") },
		{ seat: 0, cards: holeCards("3c 3d") },
	],
};

describe("evolve", () => {
	it("starts from an idle hand", () => {
		expect(initialHandState).toEqual({ status: "idle" });
		const started = play();
		expect(started).toMatchObject({
			status: "in-progress",
			handId: "hand-1",
			street: "preflop",
			board: [],
			nextCard: 0,
			currentBet: 0,
			minRaise: 10,
			toAct: null,
			pots: [],
		});
		expect(seat(started, 1)).toEqual({
			seat: 1,
			playerId: "p1",
			stack: 100,
			bet: 0,
			committed: 0,
			holeCards: null,
			folded: false,
			allIn: false,
			shown: false,
			mucked: false,
		});
	});

	it("takes antes as dead money and blinds as bets", () => {
		const state = play(...antes, ...blinds);
		expect(seat(state, 0)).toMatchObject({ stack: 99, bet: 0, committed: 1 });
		expect(seat(state, 1)).toMatchObject({ stack: 94, bet: 5, committed: 6 });
		expect(seat(state, 2)).toMatchObject({ stack: 89, bet: 10, committed: 11 });
		expect(state.currentBet).toBe(10);
		expect(chipsInPlay(state)).toBe(300);
	});

	it("marks a short ante or blind all-in", () => {
		const state = play(
			{ type: "AntePosted", v: 1, seat: 0, amount: 100, allIn: true },
			{
				type: "BlindPosted",
				v: 1,
				seat: 1,
				blind: "small",
				amount: 100,
				allIn: true,
			},
		);
		expect(seat(state, 0)).toMatchObject({ stack: 0, allIn: true });
		expect(seat(state, 1)).toMatchObject({ stack: 0, bet: 100, allIn: true });
	});

	it("deals hole cards from the top of the deck", () => {
		const state = play(dealt);
		expect(formatCards(seat(state, 0).holeCards!)).toBe("3c 3d");
		expect(state.nextCard).toBe(6);
	});

	it("tracks bets, full raises and short all-ins (RULES §8)", () => {
		let state = play(...blinds);
		state = evolve(state, {
			type: "PlayerActed",
			v: 1,
			seat: 0,
			action: "raise",
			amount: 30,
			allIn: false,
		}) as ActiveHand;
		expect(state).toMatchObject({
			currentBet: 30,
			minRaise: 20,
			lastAggressor: 0,
		});

		// Seat 1 adds 40 more: a raise to 45 is only 15 over 30, short of a full raise.
		state = evolve(state, {
			type: "PlayerActed",
			v: 1,
			seat: 1,
			action: "raise",
			amount: 40,
			allIn: true,
		}) as ActiveHand;
		expect(state).toMatchObject({
			currentBet: 45,
			minRaise: 20,
			lastAggressor: 1,
		});
		expect(seat(state, 1)).toMatchObject({ bet: 45, allIn: true });

		state = evolve(state, {
			type: "PlayerActed",
			v: 1,
			seat: 2,
			action: "call",
			amount: 35,
			allIn: false,
		}) as ActiveHand;
		expect(state).toMatchObject({ currentBet: 45, lastAggressor: 1 });

		state = evolve(state, {
			type: "PlayerActed",
			v: 1,
			seat: 0,
			action: "fold",
			amount: 0,
			allIn: false,
		}) as ActiveHand;
		expect(seat(state, 0)).toMatchObject({ folded: true, bet: 30 });

		state = evolve(state, {
			type: "PlayerActed",
			v: 1,
			seat: 2,
			action: "check",
			amount: 0,
			allIn: false,
		}) as ActiveHand;
		expect(state.currentBet).toBe(45);
	});

	it("returns an uncalled bet, collects pots and deals the next street", () => {
		let state = play(...blinds, {
			type: "PlayerActed",
			v: 1,
			seat: 0,
			action: "raise",
			amount: 60,
			allIn: false,
		});
		state = evolve(state, {
			type: "UncalledBetReturned",
			v: 1,
			seat: 0,
			amount: 50,
		}) as ActiveHand;
		expect(seat(state, 0)).toMatchObject({ stack: 90, bet: 10, committed: 10 });
		expect(state.currentBet).toBe(10);

		state = evolve(state, {
			type: "PotsCollected",
			v: 1,
			pots: [{ amount: 25, eligibleSeats: [0, 1, 2] }],
		}) as ActiveHand;
		expect(state.players.every((player) => player.bet === 0)).toBe(true);
		expect(state.pots).toEqual([
			{ amount: 25, eligibleSeats: [0, 1, 2], awarded: false },
		]);

		state = evolve(state, {
			type: "StreetDealt",
			v: 1,
			street: "flop",
			burn: config.deck[6]!,
			cards: config.deck.slice(7, 10),
		}) as ActiveHand;
		expect(state).toMatchObject({
			street: "flop",
			nextCard: 4,
			currentBet: 0,
			minRaise: 10,
			lastAggressor: null,
		});
		expect(state.board).toEqual(config.deck.slice(7, 10));
		expect(chipsInPlay(state)).toBe(300);
	});

	it("settles a showdown and ends the hand", () => {
		let state = play(dealt, {
			type: "PotsCollected",
			v: 1,
			pots: [
				{ amount: 30, eligibleSeats: [0, 1, 2] },
				{ amount: 20, eligibleSeats: [1, 2] },
			],
		});
		state = replayHand(
			[
				{ type: "ShowdownStarted", v: 1 },
				{ type: "CardsShown", v: 1, seat: 0, cards: holeCards("3c 3d") },
				{ type: "CardsMucked", v: 1, seat: 1 },
				{
					type: "PotAwarded",
					v: 1,
					pot: 1,
					winners: [{ seat: 2, amount: 20 }],
				},
				{
					type: "PotAwarded",
					v: 1,
					pot: 0,
					winners: [
						{ seat: 0, amount: 15 },
						{ seat: 2, amount: 15 },
					],
				},
				{
					type: "HandEnded",
					v: 1,
					stacks: [
						{ seat: 0, stack: 115 },
						{ seat: 1, stack: 100 },
						{ seat: 2, stack: 135 },
					],
				},
			],
			state,
		) as ActiveHand;
		expect(state).toMatchObject({
			status: "ended",
			street: "showdown",
			toAct: null,
		});
		expect(seat(state, 0)).toMatchObject({ shown: true, stack: 115 });
		expect(seat(state, 1)).toMatchObject({ mucked: true });
		expect(seat(state, 2).stack).toBe(135);
		expect(state.pots.every((pot) => pot.awarded)).toBe(true);
	});

	it("rejects a corrupt stream", () => {
		expect(() => evolve(initialHandState, blinds[0]!)).toThrow(
			"BlindPosted cannot come before HandStarted",
		);
		expect(() => play(handStarted(config))).toThrow(
			"Hand hand-1 has already started",
		);
		expect(() => play({ type: "CardsMucked", v: 1, seat: 9 })).toThrow(
			"Seat 9 is not in hand hand-1",
		);
	});

	it("never changes the state it is given", () => {
		const state: HandState = play(...blinds);
		const before = structuredClone(state);
		evolve(state, {
			type: "PlayerActed",
			v: 1,
			seat: 0,
			action: "raise",
			amount: 30,
			allIn: false,
		});
		evolve(state, { type: "HandEnded", v: 1, stacks: [] });
		expect(state).toEqual(before);
	});
});
