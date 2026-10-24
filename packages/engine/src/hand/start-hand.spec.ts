import type { Card } from "../cards/index.js";
import { given } from "../testing/hand-harness.js";
import { handConfig, handStarted, players } from "../testing/hand-fixtures.js";
import type { HandConfig, HandPlayer } from "./config.js";
import type { HandEvent } from "./events.js";
import { replayHand } from "./evolve.js";
import type { ActiveHand } from "./state.js";

// The fixture deck is unshuffled, so the card dealt from position i is simply card i.
const card = (position: number) => position as Card;

/** Two cards each, one at a time, in the given seat order (RULES §5). */
const dealt = (order: readonly number[]): HandEvent => ({
	type: "HoleCardsDealt",
	v: 1,
	hands: order.map((seat, index) => ({
		seat,
		cards: [card(index), card(order.length + index)],
	})),
});

const blind = (
	seat: number,
	kind: "small" | "big",
	amount: number,
	allIn = false,
): HandEvent => ({
	type: "BlindPosted",
	v: 1,
	seat,
	blind: kind,
	amount,
	allIn,
});

const start = (config: HandConfig) =>
	given([]).when({ type: "StartHand", config });

const at = (
	seat: number,
	stack: number,
	playerId = `p${seat}`,
): HandPlayer => ({
	seat,
	playerId,
	stack,
});

/** The first to act once the flop is dealt. */
function postflopToAct(events: readonly HandEvent[]): number | null {
	const state = replayHand([
		...events,
		{ type: "PotsCollected", v: 1, pots: [] },
		{
			type: "StreetDealt",
			v: 1,
			street: "flop",
			burn: card(40),
			cards: [card(41), card(42), card(43)],
		},
	]) as ActiveHand;
	return state.toAct;
}

describe("StartHand: blinds, dealing and the first to act", () => {
	it("heads-up: the button posts the small blind, gets the last card, acts first preflop and last after", () => {
		const config = handConfig({ players: players(2), buttonSeat: 0 });
		const events = [
			handStarted(config),
			blind(0, "small", 5),
			blind(1, "big", 10),
			dealt([1, 0]),
		];
		const state = start(config).then(events) as ActiveHand;
		expect(state.toAct).toBe(0);
		expect(state.currentBet).toBe(10);
		expect(postflopToAct(events)).toBe(1);
	});

	it("heads-up with the button on the higher seat", () => {
		const config = handConfig({
			players: [at(3, 500), at(7, 500)],
			buttonSeat: 7,
		});
		const events = [
			handStarted(config),
			blind(7, "small", 5),
			blind(3, "big", 10),
			dealt([3, 7]),
		];
		expect((start(config).then(events) as ActiveHand).toAct).toBe(7);
		expect(postflopToAct(events)).toBe(3);
	});

	it("three-handed: the button is first to act preflop", () => {
		const config = handConfig({ players: players(3), buttonSeat: 0 });
		const events = [
			handStarted(config),
			blind(1, "small", 5),
			blind(2, "big", 10),
			dealt([1, 2, 0]),
		];
		expect((start(config).then(events) as ActiveHand).toAct).toBe(0);
		expect(postflopToAct(events)).toBe(1);
	});

	it("six-handed: blinds and the deal start left of the button and wrap around", () => {
		const config = handConfig({ players: players(6), buttonSeat: 3 });
		const events = [
			handStarted(config),
			blind(4, "small", 5),
			blind(5, "big", 10),
			dealt([4, 5, 0, 1, 2, 3]),
		];
		const state = start(config).then(events) as ActiveHand;
		expect(state.toAct).toBe(0);
		expect(state.nextCard).toBe(12);
		expect(postflopToAct(events)).toBe(4);
	});

	it("nine-handed with an empty seat: positions skip the gap", () => {
		const seats = [0, 1, 2, 4, 5, 6, 7, 8, 9];
		const config = handConfig({
			players: seats.map((seat) => at(seat, 1000)),
			buttonSeat: 9,
		});
		const events = [
			handStarted(config),
			blind(0, "small", 5),
			blind(1, "big", 10),
			dealt([0, 1, 2, 4, 5, 6, 7, 8, 9]),
		];
		expect((start(config).then(events) as ActiveHand).toAct).toBe(2);
		expect(postflopToAct(events)).toBe(0);
	});

	it("skips folded and all-in players when choosing who acts after the flop", () => {
		const config = handConfig({ players: players(4), buttonSeat: 0 });
		const events: HandEvent[] = [
			handStarted(config),
			blind(1, "small", 5),
			blind(2, "big", 10),
			dealt([1, 2, 3, 0]),
			{
				type: "PlayerActed",
				v: 1,
				seat: 1,
				action: "fold",
				amount: 0,
				allIn: false,
			},
			{
				type: "PlayerActed",
				v: 1,
				seat: 2,
				action: "raise",
				amount: 990,
				allIn: true,
			},
		];
		expect(postflopToAct(events)).toBe(3);
	});

	it("deals around a dead button on an empty seat", () => {
		const config = handConfig({ players: players(3), buttonSeat: 5 });
		const events = [
			handStarted(config),
			blind(0, "small", 5),
			blind(1, "big", 10),
			dealt([0, 1, 2]),
		];
		expect((start(config).then(events) as ActiveHand).toAct).toBe(2);
	});
});

describe("StartHand: short stacks", () => {
	it("puts a small blind short of chips all-in for less", () => {
		const config = handConfig({
			players: [at(0, 1000), at(1, 3), at(2, 1000)],
		});
		start(config).then([
			handStarted(config),
			blind(1, "small", 3, true),
			blind(2, "big", 10),
			dealt([1, 2, 0]),
		]);
	});

	it("puts a short big blind all-in for less, but the others still call the full big blind", () => {
		const config = handConfig({
			players: [at(0, 1000), at(1, 1000), at(2, 4)],
		});
		const state = start(config).then([
			handStarted(config),
			blind(1, "small", 5),
			blind(2, "big", 4, true),
			dealt([1, 2, 0]),
		]) as ActiveHand;
		expect(state.currentBet).toBe(10);
		expect(state.toAct).toBe(0);
	});

	it("has nobody to act when every player is all-in from the blinds", () => {
		const config = handConfig({
			players: [at(0, 5), at(1, 10)],
			buttonSeat: 0,
		});
		const state = start(config).then([
			handStarted(config),
			blind(0, "small", 5, true),
			blind(1, "big", 10, true),
			dealt([1, 0]),
		]) as ActiveHand;
		expect(state.toAct).toBeNull();
	});
});

describe("StartHand: antes", () => {
	const ante = (seat: number, amount: number, allIn = false): HandEvent => ({
		type: "AntePosted",
		v: 1,
		seat,
		amount,
		allIn,
	});

	it("takes an ante from every player, in dealing order, before the blinds", () => {
		const config = handConfig({ ante: 2 });
		const state = start(config).then([
			handStarted(config),
			ante(1, 2),
			ante(2, 2),
			ante(0, 2),
			blind(1, "small", 5),
			blind(2, "big", 10),
			dealt([1, 2, 0]),
		]) as ActiveHand;
		expect(state.players.map((player) => player.stack)).toEqual([
			998, 993, 988,
		]);
	});

	it("skips the blind of a player the ante put all-in, and skips them when choosing who acts", () => {
		const config = handConfig({
			ante: 2,
			players: [at(0, 2), at(1, 2), at(2, 1000), at(3, 1000)],
		});
		const state = start(config).then([
			handStarted(config),
			ante(1, 2, true),
			ante(2, 2),
			ante(3, 2),
			ante(0, 2, true),
			blind(2, "big", 10),
			dealt([1, 2, 3, 0]),
		]) as ActiveHand;
		expect(state.toAct).toBe(3);
	});
});
