import { CARD_COUNT, isCard } from "../cards/index.js";
import type { HandCommand } from "./commands.js";
import { type HandConfig, MAX_PLAYERS, MIN_PLAYERS } from "./config.js";
import type { HandError, InvalidConfigReason } from "./errors.js";
import type { HandEvent } from "./events.js";
import type { ActiveHand, HandState } from "./state.js";

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
	if (!isChips(config.buttonSeat)) return "button";
	if (
		deck.length !== CARD_COUNT ||
		!deck.every(isCard) ||
		new Set(deck).size !== CARD_COUNT
	) {
		return "deck";
	}
	return null;
}

function startHand(config: HandConfig): Decision {
	const reason = validateConfig(config);
	if (reason) {
		return reject({ code: "hand.invalid-config", params: { reason } });
	}
	// Copies, so an event never shares arrays with the caller and stays plain JSON.
	return accept({
		type: "HandStarted",
		v: 1,
		handId: config.handId,
		smallBlind: config.smallBlind,
		bigBlind: config.bigBlind,
		ante: config.ante,
		buttonSeat: config.buttonSeat,
		players: config.players
			.map(({ seat, playerId, stack }) => ({ seat, playerId, stack }))
			.toSorted((a, b) => a.seat - b.seat),
		deck: [...config.deck],
	});
}

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
	return show
		? accept({ type: "CardsShown", v: 1, seat, cards: player.holeCards })
		: accept({ type: "CardsMucked", v: 1, seat });
}

/**
 * Decides what a command means for the hand: the events it causes, or why it is rejected
 * (ADR-002). Pure and synchronous; it never changes `state`.
 */
export function decide(command: HandCommand, state: HandState): Decision {
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
		case "Timeout":
			// Turn order arrives with blinds and betting (POK-48, POK-49): until then nobody is to act.
			return reject({
				code: "hand.not-your-turn",
				params: { seat: command.seat },
			});
		case "ShowCards":
			return revealAtShowdown(state, command.seat, true);
		case "MuckCards":
			return revealAtShowdown(state, command.seat, false);
	}
}
