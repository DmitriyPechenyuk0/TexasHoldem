import { formatCards } from "../cards/index.js";
import {
	handConfig,
	handStarted,
	holeCards,
	players,
	riggedDeck,
} from "./hand-fixtures.js";
import { play } from "./hand-harness.js";
import { simulateHand } from "./hand-simulation.js";

describe("hand fixtures", () => {
	it("builds players, a valid config and its HandStarted event", () => {
		expect(players(2, 50)).toEqual([
			{ seat: 0, playerId: "p0", stack: 50 },
			{ seat: 1, playerId: "p1", stack: 50 },
		]);
		expect(handConfig({ bigBlind: 20 })).toMatchObject({
			smallBlind: 5,
			bigBlind: 20,
		});
		expect(handStarted()).toMatchObject({
			type: "HandStarted",
			v: 1,
			handId: "hand-1",
		});
	});

	it("rigs a deck to deal the given hole cards and board", () => {
		// Button 0: seat 1 gets the first card, the button the last; then burn, flop, burn, turn…
		const deck = riggedDeck({ 0: "As Ad", 1: "Kc Kd" }, "Ah Kh 3c 8d 9s");
		expect(formatCards(deck.slice(0, 4))).toBe("Kc As Kd Ad");
		expect(
			formatCards([5, 6, 7, 9, 11].map((position) => deck[position]!)),
		).toBe("Ah Kh 3c 8d 9s");
		expect(new Set(deck).size).toBe(52);
		expect(() => riggedDeck({ 0: "As Ad" }, "As Kh 3c")).toThrow(RangeError);
	});

	it("reads exactly two hole cards", () => {
		expect(formatCards(holeCards("As Kd"))).toBe("As Kd");
		expect(() => holeCards("As")).toThrow(RangeError);
		expect(() => holeCards("As Kd Qh")).toThrow(RangeError);
	});
});

describe("simulateHand", () => {
	it("plays a hand to the end, and fails loudly on a command the engine rejects", () => {
		const events = simulateHand(handConfig(), [0]);
		expect(events.at(-1)?.type).toBe("HandEnded");
		expect(() =>
			simulateHand(handConfig({ players: players(1) }), [0]),
		).toThrow("StartHand was rejected: hand.invalid-config");
	});
});

describe("play", () => {
	it("fails loudly with the error code when a command is rejected", () => {
		expect(() => play([], { type: "Timeout", seat: 0 })).toThrow(
			"Timeout was rejected: hand.not-started",
		);
	});
});
