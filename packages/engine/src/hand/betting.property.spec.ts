import fc from "fast-check";
import { play } from "../testing/hand-harness.js";
import { handConfig } from "../testing/hand-fixtures.js";
import { type LegalActions, legalActions, needsToAct } from "./betting.js";
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

/** Stands in for street progression (POK-51): collects the bets and deals the next street. */
function dealNextStreet(events: readonly HandEvent[]): HandEvent[] | null {
	const hand = stateOf(events);
	const next = ({ preflop: "flop", flop: "turn", turn: "river" } as const)[
		hand.street as "preflop"
	];
	if (!next || hand.players.filter((player) => !player.folded).length < 2) {
		return null;
	}
	const count = next === "flop" ? 3 : 1;
	return [
		...events,
		{ type: "PotsCollected", v: 1, pots: [] },
		{
			type: "StreetDealt",
			v: 1,
			street: next,
			burn: hand.deck[hand.nextCard]!,
			cards: hand.deck.slice(hand.nextCard + 1, hand.nextCard + 1 + count),
		},
	];
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

it("legalActions agrees with decide, and the round keeps its invariants, on random hands", () => {
	fc.assert(
		fc.property(
			fc.array(fc.integer({ min: 1, max: 300 }), {
				minLength: 2,
				maxLength: 7,
			}),
			fc.nat(10),
			fc.array(step, { minLength: 10, maxLength: 120 }),
			(stacks, button, steps) => {
				const config = handConfig({
					smallBlind: 1,
					bigBlind: 2,
					buttonSeat: button % stacks.length,
					players: stacks.map((stack, seat) => ({
						seat,
						playerId: `p${seat}`,
						stack,
					})),
				});
				const chips = stacks.reduce((sum, stack) => sum + stack, 0);
				let events = play([], { type: "StartHand", config });

				for (const {
					toActor,
					seatPick,
					action,
					amountPick,
					inRange,
				} of steps) {
					let hand = stateOf(events);
					if (hand.toAct === null) {
						const next = dealNextStreet(events);
						if (!next) break;
						events = next;
						hand = stateOf(events);
						if (hand.toAct === null) continue;
					}
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
					const after = stateOf(events);
					expect(
						after.players.reduce((sum, p) => sum + p.stack + p.committed, 0),
					).toBe(chips);
					expect(
						after.players.every(
							(p) => p.stack >= 0 && Number.isSafeInteger(p.stack),
						),
					).toBe(true);
					expect(
						after.players.every(
							(p) => p.folded || p.allIn || p.bet <= after.currentBet,
						),
					).toBe(true);
					if (after.toAct !== null) {
						const toAct = after.players.find((p) => p.seat === after.toAct)!;
						expect(needsToAct(after, toAct)).toBe(true);
						expect(legalActions(after, after.toAct)).not.toBeNull();
					} else {
						expect(after.players.some((p) => needsToAct(after, p))).toBe(false);
					}
				}
			},
		),
		{ numRuns: 400 },
	);
});
