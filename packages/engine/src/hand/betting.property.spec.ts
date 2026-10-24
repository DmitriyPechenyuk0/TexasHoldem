import fc from "fast-check";
import { fullDeck } from "../cards/index.js";
import { play } from "../testing/hand-harness.js";
import { handConfig } from "../testing/hand-fixtures.js";
import { type LegalActions, legalActions } from "./betting.js";
import type { ActionKind, HandCommand } from "./commands.js";
import { decide } from "./decide.js";
import type { HandEvent } from "./events.js";
import { replayHand } from "./evolve.js";
import type { ActiveHand } from "./state.js";

const stateOf = (events: readonly HandEvent[]) =>
	replayHand(events) as ActiveHand;

/** What `legalActions` promises about a command; `decide` must accept exactly these. */
function permitted(
	legal: LegalActions | null,
	hand: ActiveHand,
	command: Extract<HandCommand, { type: "Act" }>,
) {
	if (!legal) {
		return false;
	}
	const player = hand.players.find(
		(candidate) => candidate.seat === command.seat,
	)!;
	const { aggression } = legal;
	switch (command.action) {
		case "fold":
			return true;
		case "check":
			return legal.canCheck;
		case "call":
			return legal.callAmount > 0;
		case "all-in":
			return (
				player.bet + player.stack <= hand.currentBet || aggression !== null
			);
		case "bet":
		case "raise": {
			const to = command.amount;
			return (
				aggression !== null &&
				aggression.kind === command.action &&
				to !== undefined &&
				Number.isSafeInteger(to) &&
				to >= aggression.minTo &&
				to <= aggression.maxTo
			);
		}
	}
}

// Weighted so hands usually get past the flop: mostly the player to act, mostly calls and checks.
const step = fc.record({
	toActor: fc.oneof(
		{ arbitrary: fc.constant(true), weight: 5 },
		{ arbitrary: fc.constant(false), weight: 1 },
	),
	seatPick: fc.nat(20),
	action: fc.oneof(
		{ arbitrary: fc.constantFrom<ActionKind>("call", "check"), weight: 6 },
		{ arbitrary: fc.constantFrom<ActionKind>("bet", "raise"), weight: 3 },
		{ arbitrary: fc.constantFrom<ActionKind>("fold", "all-in"), weight: 1 },
	),
	amountPick: fc.oneof(
		fc.integer({ min: -10, max: 3000 }),
		fc.constant(Number.NaN),
		fc.double(),
	),
	inRange: fc.oneof(
		{ arbitrary: fc.constant(true), weight: 3 },
		{ arbitrary: fc.constant(false), weight: 1 },
	),
});

// Commands here are random, legal or not: the point is that decide accepts exactly what legalActions
// offers. The invariants of whole hands are checked by simulation.spec.ts, which plays only legal ones.
it("legalActions agrees with decide on random, often illegal, commands", () => {
	fc.assert(
		fc.property(
			fc.array(fc.integer({ min: 1, max: 300 }), {
				minLength: 2,
				maxLength: 7,
			}),
			fc.nat(10),
			fc.array(step, { minLength: 10, maxLength: 120 }),
			fc.shuffledSubarray(fullDeck(), { minLength: 52, maxLength: 52 }),
			(stacks, button, steps, deck) => {
				const config = handConfig({
					smallBlind: 1,
					bigBlind: 2,
					buttonSeat: button % stacks.length,
					deck,
					players: stacks.map((stack, seat) => ({
						seat,
						playerId: `p${seat}`,
						stack,
					})),
				});
				let events = play([], { type: "StartHand", config });

				for (const {
					toActor,
					seatPick,
					action,
					amountPick,
					inRange,
				} of steps) {
					const hand = stateOf(events);
					// Streets come on their own: the betting only stops at the showdown or the end.
					if (hand.status === "ended" || hand.street === "showdown") {
						break;
					}
					expect(hand.toAct).not.toBeNull();
					const seat = toActor ? hand.toAct! : seatPick % stacks.length;
					const legal = legalActions(hand, seat);
					const amount =
						inRange && legal?.aggression
							? legal.aggression.minTo +
								(Math.abs(Math.trunc(amountPick)) %
									(legal.aggression.maxTo - legal.aggression.minTo + 1) || 0)
							: amountPick;
					const command = { type: "Act", seat, action, amount } as const;

					const decision = decide(command, hand);
					expect(decision.ok, JSON.stringify({ command, legal })).toBe(
						permitted(legal, hand, command),
					);
					if (!decision.ok) continue;

					events = [...events, ...decision.events];
				}
			},
		),
		{ numRuns: 400 },
	);
});
