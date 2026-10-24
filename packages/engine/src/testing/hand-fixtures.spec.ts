import { formatCards } from "../cards/index.js";
import {
	handConfig,
	handStarted,
	holeCards,
	players,
} from "./hand-fixtures.js";
import { play } from "./hand-harness.js";

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

	it("reads exactly two hole cards", () => {
		expect(formatCards(holeCards("As Kd"))).toBe("As Kd");
		expect(() => holeCards("As")).toThrow(RangeError);
		expect(() => holeCards("As Kd Qh")).toThrow(RangeError);
	});
});

describe("play", () => {
	it("fails loudly with the error code when a command is rejected", () => {
		expect(() => play([], { type: "Timeout", seat: 0 })).toThrow(
			"Timeout was rejected: hand.not-started",
		);
	});
});
