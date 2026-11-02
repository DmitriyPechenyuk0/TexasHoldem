import { given, play } from "../testing/hand-harness.js";
import { handConfig, players } from "../testing/hand-fixtures.js";
import type { HandEvent } from "./events.js";
import type { ActiveHand } from "./state.js";
import { redactEvent } from "./view.js";

// `CancelHand`: the hand is called off undecided, as when an admin closes the table by force.

const cancelled = (...stacks: [number, number][]): HandEvent => ({
	type: "HandCancelled",
	v: 1,
	stacks: stacks.map(([seat, stack]) => ({ seat, stack })),
});

describe("CancelHand", () => {
	it("gives back the blinds and bets of a hand that just started", () => {
		const history = play([], { type: "StartHand", config: handConfig() });

		given(history)
			.when({ type: "CancelHand" })
			.then([cancelled([0, 1000], [1, 1000], [2, 1000])]);
	});

	it("gives back what is in the pots and what is still in front of the players", () => {
		const history = play(
			[],
			{ type: "StartHand", config: handConfig() },
			{ type: "Act", seat: 0, action: "raise", amount: 30 },
			{ type: "Act", seat: 1, action: "call" },
			{ type: "Act", seat: 2, action: "call" },
			{ type: "Act", seat: 1, action: "bet", amount: 50 },
		);

		const after = given(history)
			.when({ type: "CancelHand" })
			.then([cancelled([0, 1000], [1, 1000], [2, 1000])]) as ActiveHand;

		expect(after).toMatchObject({
			status: "ended",
			toAct: null,
			currentBet: 0,
			pots: [],
		});
		expect(after.players.map(({ bet, committed }) => bet + committed)).toEqual([
			0, 0, 0,
		]);
	});

	it("gives back antes and all-ins to unequal stacks", () => {
		const history = play(
			[],
			{
				type: "StartHand",
				config: handConfig({
					ante: 2,
					players: [
						{ seat: 0, playerId: "p0", stack: 50 },
						...players(3).slice(1),
					],
				}),
			},
			{ type: "Act", seat: 0, action: "all-in" },
		);

		given(history)
			.when({ type: "CancelHand" })
			.then([cancelled([0, 50], [1, 1000], [2, 1000])]);
	});

	it("needs a hand that is running", () => {
		given([])
			.when({ type: "CancelHand" })
			.then({ code: "hand.not-started", params: { command: "CancelHand" } });
		const history = play(
			[],
			{ type: "StartHand", config: handConfig() },
			{ type: "CancelHand" },
		);
		given(history).when({ type: "CancelHand" }).then({ code: "hand.over" });
		given(history)
			.when({ type: "Act", seat: 0, action: "fold" })
			.then({ code: "hand.over" });
	});

	it("is public, as it carries no cards", () => {
		const event = cancelled([0, 1000]);
		expect(redactEvent(event, 1)).toBe(event);
		expect(redactEvent(event, "spectator")).toBe(event);
	});
});
