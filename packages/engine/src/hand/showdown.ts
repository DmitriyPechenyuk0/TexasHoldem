import type { Card } from "../cards/index.js";
import { evaluateHand, type HandScore, scoreHand } from "../evaluator/index.js";
import type { Chips, SeatIndex } from "./config.js";
import type { HandEvent, ShownHand } from "./events.js";
import { clockwiseFrom } from "./positions.js";
import type { ActiveHand, PlayerState, PotState } from "./state.js";

/** Not folded and not mucked: a player who can still win a pot. */
const contending = (player: PlayerState) => !player.folded && !player.mucked;

const playerAt = (hand: ActiveHand, seat: SeatIndex) =>
	hand.players.find((player) => player.seat === seat) as PlayerState;

const cardsOf = (hand: ActiveHand, player: PlayerState) => [
	...(player.holeCards as readonly Card[]),
	...hand.board,
];

const scoreOf = (hand: ActiveHand, player: PlayerState): HandScore =>
	scoreHand(cardsOf(hand, player));

/** The winning hand for the table to show: what it is and which five cards make it. */
function shownHand(hand: ActiveHand, player: PlayerState): ShownHand {
	const { category, cards, ranks } = evaluateHand(cardsOf(hand, player));
	return { category, cards, ranks };
}

/**
 * The players still in, in the order they show (RULES §10, TDA 17): the last player to bet or raise
 * on the final betting round first, or, when nobody bet, the first player left of the button.
 */
export function showOrder(hand: ActiveHand): PlayerState[] {
	const inHand = hand.players.filter((player) => !player.folded);
	const aggressor = inHand.find((player) => player.seat === hand.lastAggressor);
	if (!aggressor) {
		return clockwiseFrom(inHand, hand.buttonSeat);
	}
	// The aggressor's own seat comes last in clockwiseFrom; move it to the front.
	return [aggressor, ...clockwiseFrom(inHand, aggressor.seat).slice(0, -1)];
}

/** TDA 16: with a player all-in, every hand still in is turned face up, and none may be mucked. */
const allInShowdown = (hand: ActiveHand) =>
	hand.players.some((player) => contending(player) && player.allIn);

/**
 * Whose cards the showdown waits for: the first player in showing order who has neither shown nor
 * mucked, or null once everyone has.
 */
export const showdownTurn = (hand: ActiveHand): SeatIndex | null =>
	showOrder(hand).find((player) => !player.shown && !player.mucked)?.seat ??
	null;

/**
 * Whether the player's cards are turned up without asking: always in an all-in showdown (TDA 16),
 * and otherwise when they could win or split a pot against the hands shown so far, so the first
 * player always shows (cards speak, TDA 12). A player who can only lose may muck instead.
 */
export function mustShow(hand: ActiveHand, player: PlayerState): boolean {
	if (allInShowdown(hand)) {
		return true;
	}
	// Scored only against a shown hand, so a pot nobody has shown for needs no board yet.
	return hand.pots.some(
		(pot) =>
			pot.eligibleSeats.includes(player.seat) &&
			pot.eligibleSeats
				.map((seat) => playerAt(hand, seat))
				.filter((other) => other.shown)
				.every((other) => scoreOf(hand, player) >= scoreOf(hand, other)),
	);
}

/**
 * Splits a pot equally (RULES §12, TDA 20). Chips that do not divide go one each to the winners
 * clockwise from the button, so the first winner left of the button gets the first odd chip.
 */
function split(hand: ActiveHand, amount: Chips, winners: PlayerState[]) {
	const share = Math.floor(amount / winners.length);
	const odd = amount - share * winners.length;
	return clockwiseFrom(winners, hand.buttonSeat).map((winner, index) => ({
		seat: winner.seat,
		amount: share + (index < odd ? 1 : 0),
	}));
}

/**
 * Awards every pot and ends the hand. Each pot goes separately to the best hand among the players
 * still contending for it, side pots first (TDA 21, Addendum Rule 16). A player left alone in a pot
 * wins it without showing (TDA 17-B).
 */
export function settle(hand: ActiveHand): HandEvent[] {
	const events: HandEvent[] = [];
	const won = new Map<SeatIndex, Chips>();
	for (let index = hand.pots.length - 1; index >= 0; index--) {
		const pot = hand.pots[index] as PotState;
		const contenders = pot.eligibleSeats
			.map((seat) => playerAt(hand, seat))
			.filter(contending);
		let winners = contenders;
		if (contenders.length > 1) {
			const scores = new Map(
				contenders.map((player) => [player, scoreOf(hand, player)]),
			);
			const best = Math.max(...scores.values());
			winners = contenders.filter((player) => scores.get(player) === best);
		}
		// A winner who showed is named with their hand; one who never had to show stays hidden.
		const shares = split(hand, pot.amount, winners).map((share) => {
			const winner = playerAt(hand, share.seat);
			return winner.shown ? { ...share, hand: shownHand(hand, winner) } : share;
		});
		for (const { seat, amount } of shares) {
			won.set(seat, (won.get(seat) ?? 0) + amount);
		}
		events.push({ type: "PotAwarded", v: 1, pot: index, winners: shares });
	}
	events.push({
		type: "HandEnded",
		v: 1,
		stacks: hand.players.map((player) => ({
			seat: player.seat,
			stack: player.stack + (won.get(player.seat) ?? 0),
		})),
	});
	return events;
}
