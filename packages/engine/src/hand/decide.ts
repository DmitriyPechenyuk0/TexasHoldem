import { type Card, CARD_COUNT, isCard } from "../cards/index.js";
import { bettingReopened, type LegalActions, legalActions } from "./betting.js";
import type { ActionKind, HandCommand } from "./commands.js";
import { type HandConfig, MAX_PLAYERS, MIN_PLAYERS } from "./config.js";
import type { HandError, InvalidConfigReason } from "./errors.js";
import type { HandEvent } from "./events.js";
import { replayHand } from "./evolve.js";
import { blindSeats, clockwiseFrom } from "./positions.js";
import type { ActiveHand, HandState, PlayerState } from "./state.js";
import { advanceHand } from "./streets.js";

export type Decision =
	| { readonly ok: true; readonly events: readonly HandEvent[] }
	| { readonly ok: false; readonly error: HandError };

const accept = (...events: HandEvent[]): Decision => ({ ok: true, events });
const reject = (error: HandError): Decision => ({ ok: false, error });

const isChips = (value: number) => Number.isSafeInteger(value) && value >= 0;
const isPositiveChips = (value: number) => isChips(value) && value > 0;

/** The first problem with a config, or null when a hand can start with it. */
export function validateConfig(config: HandConfig): InvalidConfigReason | null {
	const { players, deck } = config;
	const seats = players.map((player) => player.seat);
	const ids = players.map((player) => player.playerId);
	if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS)
		return "player-count";
	if (!seats.every(isChips) || new Set(seats).size !== seats.length)
		return "seats";
	if (!ids.every((id) => id.length > 0) || new Set(ids).size !== ids.length)
		return "player-ids";
	if (!players.every((player) => isPositiveChips(player.stack)))
		return "stacks";
	if (
		!isPositiveChips(config.smallBlind) ||
		!isPositiveChips(config.bigBlind) ||
		config.smallBlind > config.bigBlind
	) {
		return "blinds";
	}
	if (!isChips(config.ante)) return "ante";
	// Heads-up the button posts the small blind, so it must be on a player (TDA 34-B).
	if (
		!isChips(config.buttonSeat) ||
		(players.length === 2 && !seats.includes(config.buttonSeat))
	) {
		return "button";
	}
	if (
		deck.length !== CARD_COUNT ||
		!deck.every(isCard) ||
		new Set(deck).size !== CARD_COUNT
	) {
		return "deck";
	}
	return null;
}

/**
 * Starts a hand (RULES §4, §5): antes from everyone if the game has them, the blinds, then two
 * hole cards each, one at a time from the top of the deck, starting left of the button so the
 * button gets the last card. A player short of an ante or a blind posts what they have, all-in.
 */
function startHand(config: HandConfig): Decision {
	const reason = validateConfig(config);
	if (reason) {
		return reject({ code: "hand.invalid-config", params: { reason } });
	}
	// Copies, so an event never shares arrays with the caller and stays plain JSON.
	const players = config.players
		.map(({ seat, playerId, stack }) => ({ seat, playerId, stack }))
		.toSorted((a, b) => a.seat - b.seat);
	const events: HandEvent[] = [
		{
			type: "HandStarted",
			v: 1,
			handId: config.handId,
			smallBlind: config.smallBlind,
			bigBlind: config.bigBlind,
			ante: config.ante,
			buttonSeat: config.buttonSeat,
			players,
			deck: [...config.deck],
		},
	];

	const stacks = new Map(players.map((player) => [player.seat, player.stack]));
	const post = (seat: number, wanted: number) => {
		const stack = stacks.get(seat) as number;
		const amount = Math.min(wanted, stack);
		stacks.set(seat, stack - amount);
		return { amount, allIn: amount === stack };
	};

	const dealingOrder = clockwiseFrom(players, config.buttonSeat);
	if (config.ante > 0) {
		for (const { seat } of dealingOrder) {
			events.push({
				type: "AntePosted",
				v: 1,
				seat,
				...post(seat, config.ante),
			});
		}
	}
	const blinds = blindSeats(players, config.buttonSeat);
	for (const [blind, seat, size] of [
		["small", blinds.smallBlind, config.smallBlind],
		["big", blinds.bigBlind, config.bigBlind],
	] as const) {
		// A player the ante already put all-in has nothing left to post.
		if ((stacks.get(seat) as number) > 0) {
			events.push({
				type: "BlindPosted",
				v: 1,
				seat,
				blind,
				...post(seat, size),
			});
		}
	}

	const count = dealingOrder.length;
	events.push({
		type: "HoleCardsDealt",
		v: 1,
		hands: dealingOrder.map(({ seat }, index) => ({
			seat,
			cards: [config.deck[index], config.deck[count + index]] as [Card, Card],
		})),
	});
	return { ok: true, events };
}

/**
 * A bet or raise to a total of `to` (RULES §8): the minimum bet is the big blind, a raise adds at
 * least the last full bet or raise, and a player short of either may only go all-in for less.
 */
function aggress(
	hand: ActiveHand,
	legal: LegalActions,
	player: PlayerState,
	wanted: "bet" | "raise" | undefined,
	to: number | undefined,
): Decision {
	const { aggression } = legal;
	if (!aggression) {
		return reject({
			code: bettingReopened(hand, player)
				? "hand.raise-not-allowed"
				: "hand.betting-not-reopened",
		});
	}
	if (wanted && wanted !== aggression.kind) {
		return reject({
			code: wanted === "bet" ? "hand.illegal-bet" : "hand.illegal-raise",
		});
	}
	if (to === undefined || !Number.isSafeInteger(to)) {
		return reject({ code: "hand.invalid-amount" });
	}
	if (to > aggression.maxTo) {
		return reject({
			code: "hand.insufficient-chips",
			params: { maxTo: aggression.maxTo },
		});
	}
	if (to < aggression.minTo) {
		return reject({
			code:
				aggression.kind === "bet"
					? "hand.bet-too-small"
					: "hand.raise-too-small",
			params: { minTo: aggression.minTo },
		});
	}
	return accept({
		type: "PlayerActed",
		v: 1,
		seat: player.seat,
		action: aggression.kind,
		amount: to - player.bet,
		allIn: to === aggression.maxTo,
	});
}

/** A player's action on their turn, checked against exactly what `legalActions` offers. */
function act(
	hand: ActiveHand,
	seat: number,
	action: ActionKind,
	amount?: number,
): Decision {
	if (hand.street === "showdown") {
		return reject({ code: "hand.betting-over" });
	}
	const legal = legalActions(hand, seat);
	if (!legal) {
		return reject({ code: "hand.not-your-turn", params: { seat } });
	}
	const player = hand.players.find(
		(candidate) => candidate.seat === seat,
	) as PlayerState;
	const acted = (kind: "fold" | "check" | "call", chips: number): Decision =>
		accept({
			type: "PlayerActed",
			v: 1,
			seat,
			action: kind,
			amount: chips,
			allIn: kind === "call" && chips === player.stack,
		});

	switch (action) {
		case "fold":
			return acted("fold", 0);
		case "check":
			return legal.canCheck
				? acted("check", 0)
				: reject({
						code: "hand.illegal-check",
						params: { callAmount: legal.callAmount },
					});
		case "call":
			return legal.callAmount > 0
				? acted("call", legal.callAmount)
				: reject({ code: "hand.nothing-to-call" });
		case "all-in":
			// All-in for no more than the bet faced is a call; for more, a bet or raise of everything.
			return player.bet + player.stack <= hand.currentBet
				? acted("call", player.stack)
				: aggress(hand, legal, player, undefined, player.bet + player.stack);
		case "bet":
		case "raise":
			return aggress(hand, legal, player, action, amount);
	}
}

/**
 * The turn timer ran out (POK-54): the player checks when that is free, otherwise folds. At the
 * showdown, a player who did not choose to show mucks.
 */
function timeout(hand: ActiveHand, seat: number): Decision {
	if (hand.street === "showdown") {
		return hand.toAct === seat
			? accept({ type: "CardsMucked", v: 1, seat, auto: true })
			: reject({ code: "hand.not-your-turn", params: { seat } });
	}
	const legal = legalActions(hand, seat);
	if (!legal) {
		return reject({ code: "hand.not-your-turn", params: { seat } });
	}
	return accept({
		type: "PlayerActed",
		v: 1,
		seat,
		action: legal.canCheck ? "check" : "fold",
		amount: 0,
		allIn: false,
		auto: true,
	});
}

/**
 * Showing or mucking at the showdown (RULES §10). Anyone still in may show at any time (TDA 17);
 * mucking waits for the player's turn, which comes only to a player who cannot win a pot.
 */
function revealAtShowdown(
	hand: ActiveHand,
	seat: number,
	show: boolean,
): Decision {
	if (hand.street !== "showdown") {
		return reject({ code: "hand.showdown-not-reached", params: { seat } });
	}
	const player = hand.players.find((candidate) => candidate.seat === seat);
	if (!player?.holeCards || player.folded || player.mucked) {
		return reject({ code: "hand.player-not-in-hand", params: { seat } });
	}
	if (player.shown) {
		return reject({ code: "hand.cards-already-shown", params: { seat } });
	}
	if (show) {
		return accept({ type: "CardsShown", v: 1, seat, cards: player.holeCards });
	}
	return hand.toAct === seat
		? accept({ type: "CardsMucked", v: 1, seat })
		: reject({ code: "hand.not-your-turn", params: { seat } });
}

function decideCommand(command: HandCommand, state: HandState): Decision {
	if (command.type === "StartHand") {
		return state.status === "idle"
			? startHand(command.config)
			: reject({ code: "hand.already-started" });
	}
	if (state.status === "idle") {
		return reject({
			code: "hand.not-started",
			params: { command: command.type },
		});
	}
	if (state.status === "ended") {
		return reject({ code: "hand.over" });
	}
	switch (command.type) {
		case "Act":
			return act(state, command.seat, command.action, command.amount);
		case "Timeout":
			return timeout(state, command.seat);
		case "ShowCards":
			return revealAtShowdown(state, command.seat, true);
		case "MuckCards":
			return revealAtShowdown(state, command.seat, false);
	}
}

/**
 * Decides what a command means for the hand: the events it causes, or why it is rejected
 * (ADR-002). An accepted command also carries what follows from it on its own, such as the next
 * street once it closes a betting round. Pure and synchronous; it never changes `state`.
 */
export function decide(command: HandCommand, state: HandState): Decision {
	const decision = decideCommand(command, state);
	if (!decision.ok) {
		return decision;
	}
	const after = replayHand(decision.events, state);
	return accept(...decision.events, ...advanceHand(after));
}
