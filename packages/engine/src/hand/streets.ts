import type { Card } from "../cards/index.js";
import type { HandEvent, Pot } from "./events.js";
import { evolve } from "./evolve.js";
import { buildPots, samePots } from "./pots.js";
import { mustShow, settle, showOrder } from "./showdown.js";
import type { ActiveHand, HandState, PlayerState } from "./state.js";

const NEXT_STREET = {
	preflop: { street: "flop", cards: 3 },
	flop: { street: "turn", cards: 1 },
	turn: { street: "river", cards: 1 },
} as const;

/**
 * The part of the highest bet nobody matched goes back to the bettor (RULES §9): the difference to
 * the next highest bet, folded players' bets included. Nothing when two players share the top bet.
 */
function uncalledBet(hand: ActiveHand): HandEvent | null {
	const [top, next] = hand.players.toSorted((a, b) => b.bet - a.bet) as [
		PlayerState,
		PlayerState,
	];
	const amount = top.bet - next.bet;
	return amount > 0
		? { type: "UncalledBetReturned", v: 1, seat: top.seat, amount }
		: null;
}

/** Every chip put in this hand, split into the main pot and side pots. */
const collectPots = (hand: ActiveHand): Pot[] =>
	buildPots(
		hand.players.map(({ seat, committed }) => ({ seat, amount: committed })),
		hand.players.filter((player) => player.folded).map((player) => player.seat),
	);

/** Burns one card, then deals the next street's cards, all from the top of the deck (RULES §5). */
function dealStreet(hand: ActiveHand): HandEvent {
	const next = NEXT_STREET[hand.street as keyof typeof NEXT_STREET];
	const burn = hand.nextCard;
	return {
		type: "StreetDealt",
		v: 1,
		street: next.street,
		burn: hand.deck[burn] as Card,
		cards: hand.deck.slice(burn + 1, burn + 1 + next.cards),
	};
}

/** A player turns their hole cards face up. */
const cardsShown = (player: PlayerState): HandEvent => ({
	type: "CardsShown",
	v: 1,
	seat: player.seat,
	cards: player.holeCards as readonly [Card, Card],
});

/** What happens when a betting round ends, up to the next point where somebody must decide. */
function closeRound(round: ActiveHand): HandEvent[] {
	const events: HandEvent[] = [];
	let hand = round;
	const emit = (event: HandEvent) => {
		events.push(event);
		hand = evolve(hand, event) as ActiveHand;
	};

	const uncalled = uncalledBet(hand);
	if (uncalled) {
		emit(uncalled);
	}
	// New chips, antes included, or a fold that changed who can win: the pots are built again.
	const pots = collectPots(hand);
	if (!samePots(pots, hand.pots)) {
		emit({ type: "PotsCollected", v: 1, pots });
	}

	const inHand = hand.players.filter((player) => !player.folded);
	if (inHand.length === 1) {
		// Everyone else folded: the last player wins every pot without showing (RULES §5, TDA 17-B).
		settle(hand).forEach(emit);
		return events;
	}
	if (inHand.filter((player) => !player.allIn).length <= 1) {
		// Nobody can bet any more and someone is all-in: every hand is turned up before the rest of
		// the board is dealt (TDA 16).
		for (const player of showOrder(hand)) {
			if (!player.shown) {
				emit(cardsShown(player));
			}
		}
	}
	emit(
		hand.street === "river"
			? { type: "ShowdownStarted", v: 1 }
			: dealStreet(hand),
	);
	return events;
}

/**
 * One step at the showdown: turns up the cards of the player whose turn it is when they have to
 * show, or awards the pots once everyone has shown or mucked. Null while the showdown waits for a
 * player who may muck.
 */
function showdownStep(hand: ActiveHand): HandEvent[] | null {
	if (hand.toAct === null) {
		return settle(hand);
	}
	const player = hand.players.find(
		(candidate) => candidate.seat === hand.toAct,
	) as PlayerState;
	return mustShow(hand, player) ? [cardsShown(player)] : null;
}

/** What follows on its own from this state, or null when a player has to decide. */
function nextStep(state: HandState): HandEvent[] | null {
	if (state.status !== "in-progress") {
		return null;
	}
	if (state.street === "showdown") {
		return showdownStep(state);
	}
	return state.toAct === null ? closeRound(state) : null;
}

/**
 * The events that follow on their own once nobody has a decision to make (RULES §5, §6, §10): a
 * closed betting round ends with the uncalled bet returned and the bets collected, then the hand
 * either ends because one player is left, goes to the showdown after the river, or deals the next
 * street. When at most one player can still bet, every hand is turned up and the remaining streets
 * are dealt straight away (run-out). At the showdown, hands that can win are turned up in order,
 * and the pots are awarded once nobody is left to show or muck.
 */
export function advanceHand(state: HandState): HandEvent[] {
	const events: HandEvent[] = [];
	let hand = state;
	for (let step = nextStep(hand); step; step = nextStep(hand)) {
		events.push(...step);
		hand = step.reduce(evolve, hand);
	}
	return events;
}
