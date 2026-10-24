import fc from "fast-check";
import { type Card, fullDeck, parseCards } from "../cards/index.js";
import { play } from "../testing/hand-harness.js";
import { handConfig, holeCards, riggedDeck } from "../testing/hand-fixtures.js";
import { simulateHand } from "../testing/hand-simulation.js";
import type { ActionKind, HandCommand } from "./commands.js";
import type { HandEvent } from "./events.js";
import { evolve, replayHand } from "./evolve.js";
import { initialHandState, type HandState } from "./state.js";
import { redactEvent, toPlayerView, type Viewer } from "./view.js";

const act = (seat: number, action: ActionKind): HandCommand => ({
	type: "Act",
	seat,
	action,
});

/** The cards this viewer may know: the board, their own hole cards and every hand shown. */
function visibleCards(state: HandState, viewer: Viewer): Set<Card> {
	if (state.status === "idle") {
		return new Set();
	}
	return new Set([
		...state.board,
		...state.players.flatMap((player) =>
			player.holeCards && (player.seat === viewer || player.shown)
				? player.holeCards
				: [],
		),
	]);
}

/**
 * Every card anywhere in `value`. Cards only appear under `holeCards`, `cards` and `board`; a deck
 * or a burn card must not appear at all.
 */
function cardsIn(value: unknown, found: (Card | string)[] = []) {
	if (Array.isArray(value)) {
		value.forEach((item) => cardsIn(item, found));
	} else if (value && typeof value === "object") {
		for (const [key, inner] of Object.entries(value)) {
			if (key === "deck" || key === "burn") {
				found.push(key);
			} else if (key === "holeCards" || key === "cards" || key === "board") {
				found.push(...((inner ?? []) as Card[]));
			} else {
				cardsIn(inner, found);
			}
		}
	}
	return found;
}

// Three-handed, button 0: seat 1 holds aces, seat 2 kings, seat 0 nothing.
const config = handConfig({
	deck: riggedDeck({ 0: "7h 2s", 1: "As Ad", 2: "Kc Kd" }, "Ah Kh 3c 8d 9s"),
});
const started = play([], { type: "StartHand", config });
const checks = [1, 2, 0, 1, 2, 0, 1, 2, 0].map((seat) => act(seat, "check"));
// Limped and checked down: seat 1 shows aces first and seat 2 is to show or muck.
const atShowdown = play(
	started,
	act(0, "call"),
	act(1, "call"),
	act(2, "check"),
	...checks,
);

describe("toPlayerView", () => {
	it("an idle hand shows nothing", () => {
		expect(toPlayerView(initialHandState, 3)).toEqual({
			status: "idle",
			viewer: 3,
		});
	});

	it("a player sees their own hole cards and only card backs for the others", () => {
		const view = toPlayerView(replayHand(started), 1);
		expect(view.status !== "idle" && view.players).toEqual([
			expect.objectContaining({ seat: 0, hasCards: true, holeCards: null }),
			expect.objectContaining({
				seat: 1,
				hasCards: true,
				holeCards: holeCards("As Ad"),
			}),
			expect.objectContaining({ seat: 2, hasCards: true, holeCards: null }),
		]);
		expect(JSON.stringify(view)).not.toContain('"deck"');
	});

	it("gives the legal actions only to the player whose turn it is", () => {
		const state = replayHand(started);
		expect(toPlayerView(state, 0)).toMatchObject({
			toAct: 0,
			legalActions: { seat: 0, callAmount: 10 },
		});
		expect(toPlayerView(state, 1)).toMatchObject({ legalActions: null });
		expect(toPlayerView(state, "spectator")).toMatchObject({
			legalActions: null,
		});
	});

	it("a spectator sees no hole cards until they are shown, and a mucked hand stays hidden", () => {
		const hidden = toPlayerView(replayHand(started), "spectator");
		expect(
			hidden.status !== "idle" &&
				hidden.players.every((player) => player.holeCards === null),
		).toBe(true);

		const ended = play(
			atShowdown,
			{ type: "MuckCards", seat: 2 },
			{ type: "ShowCards", seat: 0 },
		);
		const view = toPlayerView(replayHand(ended), "spectator");
		expect(view.status !== "idle" && view.players).toEqual([
			expect.objectContaining({
				seat: 0,
				shown: true,
				holeCards: holeCards("7h 2s"),
			}),
			expect.objectContaining({
				seat: 1,
				shown: true,
				holeCards: holeCards("As Ad"),
			}),
			expect.objectContaining({ seat: 2, mucked: true, holeCards: null }),
		]);
	});
});

describe("redactEvent", () => {
	it("takes the deck out of HandStarted", () => {
		const [handStarted] = started;
		const { deck: _deck, ...rest } = handStarted as Extract<
			HandEvent,
			{ type: "HandStarted" }
		>;
		expect(redactEvent(handStarted!, 1)).toEqual(rest);
	});

	it("leaves only the viewer's own hole cards", () => {
		const dealt = started.find((event) => event.type === "HoleCardsDealt")!;
		expect(redactEvent(dealt, 2)).toEqual({
			type: "HoleCardsDealt",
			v: 1,
			hands: [
				{ seat: 1, cards: null },
				{ seat: 2, cards: holeCards("Kc Kd") },
				{ seat: 0, cards: null },
			],
		});
		expect(redactEvent(dealt, "spectator")).toMatchObject({
			hands: [{ cards: null }, { cards: null }, { cards: null }],
		});
	});

	it("deals a street without its burn card, and passes public events as they are", () => {
		const flop = atShowdown.find((event) => event.type === "StreetDealt")!;
		expect(redactEvent(flop, "spectator")).toEqual({
			type: "StreetDealt",
			v: 1,
			street: "flop",
			cards: parseCards("Ah Kh 3c"),
		});
		const shown = atShowdown.at(-1)!;
		expect(shown.type).toBe("CardsShown");
		expect(redactEvent(shown, "spectator")).toBe(shown);
	});

	it("never lets any viewer see a card they should not, at any point of a random hand", () => {
		fc.assert(
			fc.property(
				fc.array(fc.integer({ min: 1, max: 400 }), {
					minLength: 2,
					maxLength: 6,
				}),
				fc.nat(5),
				fc.shuffledSubarray(fullDeck(), { minLength: 52, maxLength: 52 }),
				fc.array(fc.nat(1000), { minLength: 1, maxLength: 60 }),
				fc.nat(2),
				(stacks, button, deck, picks, ante) => {
					const players = stacks.map((stack, seat) => ({
						seat,
						playerId: `p${seat}`,
						stack,
					}));
					const events = simulateHand(
						handConfig({
							smallBlind: 1,
							bigBlind: 2,
							ante,
							buttonSeat: button % stacks.length,
							players,
							deck,
						}),
						picks,
					);
					const viewers: Viewer[] = [
						...players.map((player) => player.seat),
						"spectator",
					];
					let state: HandState = initialHandState;
					const leaks: unknown[] = [];
					for (const event of events) {
						state = evolve(state, event);
						for (const viewer of viewers) {
							const allowed = visibleCards(state, viewer);
							const seen = [
								...cardsIn(toPlayerView(state, viewer)),
								...cardsIn(redactEvent(event, viewer)),
							];
							for (const card of seen) {
								if (!allowed.has(card as Card)) {
									leaks.push({ event: event.type, viewer, card });
								}
							}
						}
					}
					expect(leaks).toEqual([]);
				},
			),
			{ numRuns: 200 },
		);
	});
});
