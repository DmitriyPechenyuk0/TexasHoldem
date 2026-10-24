import type { Chips, SeatIndex } from "./config.js";
import { clockwiseFrom } from "./positions.js";
import type { ActiveHand, PlayerState } from "./state.js";

/** Not folded and not all-in: a player who can still put chips in. */
const canStillBet = (player: PlayerState) => !player.folded && !player.allIn;

/**
 * Whether the betting round still waits for this player (RULES §6): they face a bet they have not
 * matched, or they have not acted yet on this street (which gives the big blind its option). Nobody
 * waits for a player whose every opponent is all-in or folded and who has nothing more to call.
 */
export function needsToAct(hand: ActiveHand, player: PlayerState): boolean {
	if (!canStillBet(player)) {
		return false;
	}
	if (player.bet < hand.currentBet) {
		return true;
	}
	const opponentCanBet = hand.players.some(
		(other) => other.seat !== player.seat && canStillBet(other),
	);
	return opponentCanBet && !player.acted;
}

/**
 * Whether this player may still raise (RULES §8, TDA 47): always before they have acted on the
 * street; afterwards only once the bet has gone up by at least a full raise since they acted. Short
 * all-ins add up, so two of them together can reopen the betting.
 */
export const bettingReopened = (
	hand: ActiveHand,
	player: PlayerState,
): boolean =>
	!player.acted || hand.currentBet - player.actedAt >= hand.minRaise;

/** The next player clockwise from `seat` the round waits for, or null when the round is complete. */
export const nextToAct = (
	hand: ActiveHand,
	seat: SeatIndex,
): SeatIndex | null =>
	clockwiseFrom(hand.players, seat).find((player) => needsToAct(hand, player))
		?.seat ?? null;

/** The bet or raise a player may make, as totals for the street ("raise to", TDA 43-B). */
export interface Aggression {
	/** "bet" when nobody has bet on this street, "raise" when facing a bet. */
	readonly kind: "bet" | "raise";
	/** The smallest legal total; equals `maxTo` when only an all-in for less is possible. */
	readonly minTo: Chips;
	/** All the player's chips: their bet so far plus their stack. */
	readonly maxTo: Chips;
}

/** What the player to act may do. The UI offers exactly this, and `decide` enforces it. */
export interface LegalActions {
	readonly seat: SeatIndex;
	/** Always true on your turn, even when checking is free (a binding fold, TDA 58). */
	readonly canFold: true;
	readonly canCheck: boolean;
	/** Chips a call adds, capped at the stack (then it is an all-in call); 0 with nothing to call. */
	readonly callAmount: Chips;
	/**
	 * Null when no bet or raise is possible: every opponent is all-in, the stack does not cover more
	 * than the call, or a short all-in did not reopen the betting for this player (TDA 47).
	 */
	readonly aggression: Aggression | null;
}

/**
 * The legal actions of the player to act (RULES §7, §8), or null for anyone else and at the
 * showdown. The minimum bet is the big blind; the minimum raise adds at least the last full bet or
 * raise of the street (TDA 43). A player short of the minimum may still go all-in for less.
 */
export function legalActions(
	hand: ActiveHand,
	seat: SeatIndex,
): LegalActions | null {
	const player = hand.players.find((candidate) => candidate.seat === seat);
	if (
		hand.status !== "in-progress" ||
		hand.street === "showdown" ||
		hand.toAct !== seat ||
		!player
	) {
		return null;
	}
	const toCall = hand.currentBet - player.bet;
	const maxTo = player.bet + player.stack;
	const opponentCanRespond = hand.players.some(
		(other) => other.seat !== seat && canStillBet(other),
	);

	let aggression: Aggression | null = null;
	if (
		opponentCanRespond &&
		maxTo > hand.currentBet &&
		bettingReopened(hand, player)
	) {
		const kind = hand.currentBet === 0 ? "bet" : "raise";
		const fullMin =
			kind === "bet" ? hand.bigBlind : hand.currentBet + hand.minRaise;
		aggression = { kind, minTo: Math.min(fullMin, maxTo), maxTo };
	}
	return {
		seat,
		canFold: true,
		canCheck: toCall === 0,
		callAmount: Math.min(toCall, player.stack),
		aggression,
	};
}
