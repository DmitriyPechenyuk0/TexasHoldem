import type { SeatIndex } from "./config.js";
import type { HandEvent } from "./events.js";
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
				players: event.players.map(({ seat, playerId, stack }) => ({
					seat,
					playerId,
					stack,
					bet: 0,
					committed: 0,
					holeCards: null,
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
			return { ...hand, currentBet: Math.max(hand.currentBet, event.amount) };
		}
		case "HoleCardsDealt": {
			let hand = active(state, event);
			for (const { seat, cards } of event.hands) {
				hand = updatePlayer(hand, seat, () => ({ holeCards: cards }));
			}
			return { ...hand, nextCard: hand.nextCard + event.hands.length * 2 };
		}
		case "PlayerActed": {
			const hand = updatePlayer(active(state, event), event.seat, (player) =>
				event.action === "fold"
					? { folded: true }
					: putIn(player, event.amount, event.allIn),
			);
			const { bet } = hand.players.find(
				(player) => player.seat === event.seat,
			) as PlayerState;
			if (bet <= hand.currentBet) {
				return hand;
			}
			// Only a full raise sets a new minimum; a short all-in does not (RULES §8, TDA 43).
			const increment = bet - hand.currentBet;
			return {
				...hand,
				currentBet: bet,
				minRaise: Math.max(hand.minRaise, increment),
				lastAggressor: event.seat,
			};
		}
		case "StreetDealt": {
			const hand = active(state, event);
			return {
				...hand,
				board: [...hand.board, ...event.cards],
				nextCard: hand.nextCard + 1 + event.cards.length,
				street: event.street,
				toAct: null,
				currentBet: 0,
				minRaise: hand.bigBlind,
				lastAggressor: null,
			};
		}
		case "UncalledBetReturned": {
			const hand = updatePlayer(active(state, event), event.seat, (player) => ({
				stack: player.stack + event.amount,
				bet: player.bet - event.amount,
				committed: player.committed - event.amount,
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
				pots: event.pots.map((pot) => ({ ...pot, awarded: false })),
				toAct: null,
			};
		}
		case "ShowdownStarted":
			return { ...active(state, event), street: "showdown", toAct: null };
		case "CardsShown":
			return updatePlayer(active(state, event), event.seat, () => ({
				shown: true,
			}));
		case "CardsMucked":
			return updatePlayer(active(state, event), event.seat, () => ({
				mucked: true,
			}));
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
