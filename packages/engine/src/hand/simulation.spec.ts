import fc from "fast-check";
import { type Card, fullDeck } from "../cards/index.js";
import { handConfig } from "../testing/hand-fixtures.js";
import { randomCommand } from "../testing/hand-simulation.js";
import { legalActions, needsToAct } from "./betting.js";
import type { HandCommand } from "./commands.js";
import type { HandConfig } from "./config.js";
import { decide } from "./decide.js";
import type { HandEvent } from "./events.js";
import { evolve, replayHand } from "./evolve.js";
import { type ActiveHand, type HandState, initialHandState } from "./state.js";

// Whole hands played at random through `legalActions`, with the engine's invariants checked after
// every event and every decision. CI plays 1,000 hands; for a longer local run:
//   HOLDEM_SIM_RUNS=10000 pnpm --filter @holdem/engine test simulation
// A failure prints fast-check's seed and path; replay that exact shrunk hand with:
//   HOLDEM_SIM_SEED=<seed> HOLDEM_SIM_PATH=<path> pnpm --filter @holdem/engine test simulation

const runs = Number(process.env.HOLDEM_SIM_RUNS ?? 1000);
const seed = process.env.HOLDEM_SIM_SEED;
const path = process.env.HOLDEM_SIM_PATH;

/** More decisions than any hand needs: every raise adds at least a big blind, so hands are short. */
const MAX_DECISIONS = 1000;

/** A table of 2 to 9 players on any of ten seats, with any stacks, blinds, ante, button and deck. */
const table: fc.Arbitrary<HandConfig> = fc
	.record({
		seats: fc.uniqueArray(fc.nat(9), { minLength: 2, maxLength: 9 }),
		stacks: fc.array(fc.integer({ min: 1, max: 2000 }), {
			minLength: 9,
			maxLength: 9,
		}),
		smallBlind: fc.integer({ min: 1, max: 50 }),
		raise: fc.nat(50),
		ante: fc.oneof(fc.constant(0), fc.integer({ min: 1, max: 20 })),
		button: fc.nat(9),
		deck: fc.shuffledSubarray(fullDeck(), { minLength: 52, maxLength: 52 }),
	})
	.map(({ seats, stacks, smallBlind, raise, ante, button, deck }) =>
		handConfig({
			handId: "simulated",
			smallBlind,
			bigBlind: smallBlind + raise,
			ante,
			// Heads-up the button must be a player; otherwise it may sit on an empty seat.
			buttonSeat: seats.length === 2 ? seats[button % 2]! : button,
			players: seats.map((seat, index) => ({
				seat,
				playerId: `p${seat}`,
				stack: stacks[index]!,
			})),
			deck,
		}),
	);

const chipsOf = (config: HandConfig) =>
	config.players.reduce((sum, player) => sum + player.stack, 0);

/** Checks that hold after every single event. */
function checkEvent(hand: ActiveHand, chips: number) {
	// Chips only move between stacks, bets and pots: an awarded pot is back in a stack.
	const awarded = hand.pots
		.filter((pot) => pot.awarded)
		.reduce((sum, pot) => sum + pot.amount, 0);
	const inPlay = hand.players.reduce(
		(sum, player) => sum + player.stack + player.committed,
		0,
	);
	expect(inPlay - awarded).toBe(chips);
	for (const player of hand.players) {
		expect(Number.isSafeInteger(player.stack) && player.stack >= 0).toBe(true);
		expect(player.bet >= 0 && player.bet <= player.committed).toBe(true);
	}
	// No card is dealt twice.
	const dealt = [
		...hand.board,
		...hand.players.flatMap((player) => player.holeCards ?? []),
	];
	expect(new Set(dealt).size).toBe(dealt.length);
}

/** Checks that hold whenever the hand waits for a decision. */
function checkDecisionPoint(hand: ActiveHand) {
	expect(hand.toAct).not.toBeNull();
	const others = hand.players.filter((player) => player.seat !== hand.toAct);
	if (hand.street === "showdown") {
		expect(legalActions(hand, hand.toAct!)).toBeNull();
		return;
	}
	// Exactly one seat is to act while the betting is open.
	const toAct = hand.players.find((player) => player.seat === hand.toAct)!;
	expect(needsToAct(hand, toAct)).toBe(true);
	expect(legalActions(hand, toAct.seat)).not.toBeNull();
	expect(others.every((player) => !legalActions(hand, player.seat))).toBe(true);
	expect(
		hand.players.every(
			(player) =>
				player.folded || player.allIn || player.bet <= hand.currentBet,
		),
	).toBe(true);
	expect(hand.board.length).toBe(
		{ preflop: 0, flop: 3, turn: 4, river: 5 }[hand.street],
	);
}

/** Every card dealt, burns included, in the order it left the deck. */
function dealtInOrder(events: readonly HandEvent[]): Card[] {
	return events.flatMap((event) => {
		if (event.type === "HoleCardsDealt") {
			return [0, 1].flatMap((round) =>
				event.hands.map(({ cards }) => cards[round]!),
			);
		}
		return event.type === "StreetDealt" ? [event.burn, ...event.cards] : [];
	});
}

it(
	`plays ${runs} random hands to the end without breaking an invariant`,
	() => {
		fc.assert(
			fc.property(
				table,
				fc.array(fc.nat(1000), { minLength: 1, maxLength: 80 }),
				(config, picks) => {
					const chips = chipsOf(config);
					let next = 0;
					const pick = () => picks[next++ % picks.length]!;

					const events: HandEvent[] = [];
					let state: HandState = initialHandState;
					let command: HandCommand = { type: "StartHand", config };
					for (let decisions = 0; ; decisions++) {
						// The hand terminates.
						expect(decisions).toBeLessThan(MAX_DECISIONS);
						const decision = decide(command, state);
						// The driver only sends what legalActions offers, so nothing is rejected.
						if (!decision.ok) {
							throw new Error(
								`${command.type} was rejected: ${decision.error.code}`,
							);
						}
						for (const event of decision.events) {
							events.push(event);
							state = evolve(state, event);
							checkEvent(state as ActiveHand, chips);
						}
						if (state.status !== "in-progress") {
							break;
						}
						checkDecisionPoint(state);
						command = randomCommand(state, pick);
					}

					// Every pot is awarded and the final stacks hold every chip.
					const final = state as ActiveHand;
					expect(final.pots.every((pot) => pot.awarded)).toBe(true);
					const ended = events.at(-1)!;
					expect(ended).toEqual({
						type: "HandEnded",
						v: 1,
						stacks: final.players.map(({ seat, stack }) => ({ seat, stack })),
					});
					expect(final.players.reduce((sum, p) => sum + p.stack, 0)).toBe(
						chips,
					);

					// Cards come off the top of the deck in order, burns included (POK-45).
					const dealt = dealtInOrder(events);
					expect(dealt).toEqual(config.deck.slice(0, dealt.length));

					// Replaying the stored events, even through JSON, gives the live state.
					const stored = JSON.parse(JSON.stringify(events)) as HandEvent[];
					expect(replayHand(stored)).toEqual(state);
				},
			),
			{
				numRuns: runs,
				...(seed ? { seed: Number(seed), path } : {}),
			},
		);
		// About a millisecond a hand, several times that under coverage.
	},
	runs * 20,
);
