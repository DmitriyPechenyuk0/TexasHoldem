import type { LegalActions } from "@holdem/shared/realtime";
import { chooseAction, safeAction } from "./strategy.ts";

const facingBet: LegalActions = {
	seat: 2,
	canFold: true,
	canCheck: false,
	callAmount: 10,
	aggression: { kind: "raise", minTo: 20, maxTo: 500 },
};
const unopened: LegalActions = {
	...facingBet,
	canCheck: true,
	callAmount: 0,
	aggression: { kind: "bet", minTo: 2, maxTo: 4 },
};

/** A random source answering these numbers in turn. */
const sequence =
	(...numbers: number[]) =>
	() =>
		numbers.shift() ?? 0;

describe("chooseAction", () => {
	it("goes all in now and then", () => {
		expect(chooseAction(facingBet, sequence(0.01))).toEqual({
			action: "all-in",
		});
	});

	it("bets or raises between the minimum and three times it, within the stack", () => {
		expect(chooseAction(facingBet, sequence(0.1, 0))).toEqual({
			action: "raise",
			amount: 20,
		});
		expect(chooseAction(facingBet, sequence(0.1, 0.999))).toEqual({
			action: "raise",
			amount: 60,
		});
		expect(chooseAction(unopened, sequence(0.1, 0.999))).toEqual({
			action: "bet",
			amount: 4,
		});
	});

	it("folds only to a bet, and otherwise checks or calls", () => {
		expect(chooseAction(facingBet, sequence(0.3))).toEqual({ action: "fold" });
		expect(chooseAction(unopened, sequence(0.3))).toEqual({ action: "check" });
		expect(chooseAction(facingBet, sequence(0.9))).toEqual({ action: "call" });
		// Without a raise to make, a roll that would raise folds or calls instead.
		expect(
			chooseAction({ ...facingBet, aggression: null }, sequence(0.1)),
		).toEqual({ action: "fold" });
	});

	it("knows a move that is always allowed", () => {
		expect(safeAction(facingBet)).toEqual({ action: "call" });
		expect(safeAction(unopened)).toEqual({ action: "check" });
	});
});
