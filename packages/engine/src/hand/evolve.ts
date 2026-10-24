import type { SeatIndex } from "./config.js";
import type { HandEvent } from "./events.js";
import { nextToAct } from "./betting.js";
import { showdownTurn } from "./showdown.js";
import {
	type ActiveHand,
	type HandState,
	initialHandState,
	type PlayerState,
} from "./state.js";

function active(state: HandState, event: HandEvent): ActiveHand {
	if (state.status === "idle") {
		throw new Error(`${event.type} cannot come before HandStarted`);
	}
	return state;
}

function updatePlayer(
	state: ActiveHand,
	seat: SeatIndex,
	update: (player: PlayerState) => Partial<PlayerState>,
): ActiveHand {
	if (!state.players.some((player) => player.seat === seat)) {
		throw new Error(`Seat ${seat} is not in hand ${state.handId}`);
	}
	return {
		...state,
		players: state.players.map((player) =>
			player.seat === seat ? { ...player, ...update(player) } : player,
		),
	};
}

/** Chips moving from a player's stack into their bet for this street. */
const putIn = (
	player: PlayerState,
	amount: number,
	allIn: boolean,
): Partial<PlayerState> => ({
	stack: player.stack - amount,
	bet: player.bet + amount,
	committed: player.committed + amount,
	allIn,
});

/** At the showdown, the turn passes to the next player to show or muck (TDA 17). */
const showdownTurnTaken = (hand: ActiveHand): ActiveHand =>
	hand.street === "showdown" ? { ...hand, toAct: showdownTurn(hand) } : hand;

/**
 * Applies one event to the state. Events are facts the decider already checked, so this never
 * validates rules; it throws only on a corrupt stream, such as a seat that is not in the hand.
 * The switch has no default: an unhandled event type does not compile.
 */
export function evolve(state: HandState, event: HandEvent): HandState {
	switch (event.type) {
		case "HandStarted": {
			if (state.status !== "idle") {
				throw new Error(`Hand ${state.handId} has already started`);
			}
			return {
				status: "in-progress",
				handId: event.handId,
				smallBlind: event.smallBlind,
				bigBlind: event.bigBlind,
				ante: event.ante,
				buttonSeat: event.buttonSeat,
				smallBlindSeat: event.smallBlindSeat,
				bigBlindSeat: event.bigBlindSeat,
				players: event.players.map(({ seat, playerId, stack }) => ({
					seat,
					playerId,
					stack,
					bet: 0,
					committed: 0,
					holeCards: null,
					acted: false,
					actedAt: 0,
					folded: false,
					allIn: false,
					shown: false,
					mucked: false,
				})),
				deck: event.deck,
				nextCard: 0,
				board: [],
				street: "preflop",
				toAct: null,
				currentBet: 0,
				minRaise: event.bigBlind,
				lastAggressor: null,
				pots: [],
			};
		}
		case "AntePosted":
			// Dead money: in the pot, but not part of the player's bet (RULES §4).
			return updatePlayer(active(state, event), event.seat, (player) => ({
				stack: player.stack - event.amount,
				committed: player.committed + event.amount,
				allIn: event.allIn,
			}));
		case "BlindPosted": {
			const hand = updatePlayer(active(state, event), event.seat, (player) =>
				putIn(player, event.amount, event.allIn),
			);
			// A short big blind is all-in for less, but the others still call the full big blind.
			const bet = event.blind === "big" ? hand.bigBlind : event.amount;
			return { ...hand, currentBet: Math.max(hand.currentBet, bet) };
		}
		case "HoleCardsDealt": {
			let hand = active(state, event);
			for (const { seat, cards } of event.hands) {
				hand = updatePlayer(hand, seat, () => ({ holeCards: cards }));
			}
			// Preflop the first to act sits left of the big blind; heads-up that is the button.
			return {
				...hand,
				nextCard: hand.nextCard + event.hands.length * 2,
				toAct: nextToAct(hand, hand.bigBlindSeat),
			};
		}
		case "PlayerActed": {
			const acted = updatePlayer(
				active(state, event),
				event.seat,
				(player) => ({
					...(event.action === "fold"
						? { folded: true }
						: putIn(player, event.amount, event.allIn)),
					acted: true,
				}),
			);
			const { bet } = acted.players.find(
				(player) => player.seat === event.seat,
			) as PlayerState;
			// Only a full raise sets a new minimum; a short all-in does not (RULES §8, TDA 43).
			const raised: ActiveHand =
				bet > acted.currentBet
					? {
							...acted,
							currentBet: bet,
							minRaise: Math.max(acted.minRaise, bet - acted.currentBet),
							lastAggressor: event.seat,
						}
					: acted;
			// Whether a later short all-in reopens the betting for this player is measured from here.
			const hand = updatePlayer(raised, event.seat, () => ({
				actedAt: raised.currentBet,
			}));
			return { ...hand, toAct: nextToAct(hand, event.seat) };
		}
		case "StreetDealt": {
			const previous = active(state, event);
			const hand: ActiveHand = {
				...previous,
				players: previous.players.map((player) => ({
					...player,
					acted: false,
					actedAt: 0,
				})),
				board: [...previous.board, ...event.cards],
				nextCard: previous.nextCard + 1 + event.cards.length,
				street: event.street,
				currentBet: 0,
				minRaise: previous.bigBlind,
				lastAggressor: null,
			};
			// After the flop the first active player left of the button acts first (RULES §6).
			return { ...hand, toAct: nextToAct(hand, hand.buttonSeat) };
		}
		case "UncalledBetReturned": {
			// With chips behind again, the bettor is no longer all-in.
			const hand = updatePlayer(active(state, event), event.seat, (player) => ({
				stack: player.stack + event.amount,
				bet: player.bet - event.amount,
				committed: player.committed - event.amount,
				allIn: false,
			}));
			return {
				...hand,
				currentBet: Math.max(0, ...hand.players.map((player) => player.bet)),
			};
		}
		case "PotsCollected": {
			const hand = active(state, event);
			return {
				...hand,
				players: hand.players.map((player) => ({ ...player, bet: 0 })),
				currentBet: 0,
				pots: event.pots.map((pot) => ({ ...pot, awarded: false })),
				toAct: null,
			};
		}
		case "ShowdownStarted":
			return showdownTurnTaken({ ...active(state, event), street: "showdown" });
		case "CardsShown":
			// All-in hands are also turned up before the run-out, outside the showdown (TDA 16).
			return showdownTurnTaken(
				updatePlayer(active(state, event), event.seat, () => ({ shown: true })),
			);
		case "CardsMucked":
			return showdownTurnTaken(
				updatePlayer(active(state, event), event.seat, () => ({
					mucked: true,
				})),
			);
		case "PotAwarded": {
			let hand = active(state, event);
			for (const { seat, amount } of event.winners) {
				hand = updatePlayer(hand, seat, (player) => ({
					stack: player.stack + amount,
				}));
			}
			return {
				...hand,
				pots: hand.pots.map((pot, index) =>
					index === event.pot ? { ...pot, awarded: true } : pot,
				),
			};
		}
		case "HandEnded":
			return { ...active(state, event), status: "ended", toAct: null };
	}
}

/** Rebuilds a hand from its stream of events. */
export const replayHand = (
	events: readonly HandEvent[],
	from: HandState = initialHandState,
): HandState => events.reduce(evolve, from);
