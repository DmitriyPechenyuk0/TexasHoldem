import { type Card, CARD_COUNT, isCard } from "../cards/index.js";
import type { HandCommand } from "./commands.js";
import { type HandConfig, MAX_PLAYERS, MIN_PLAYERS } from "./config.js";
import type { HandError, InvalidConfigReason } from "./errors.js";
import type { HandEvent } from "./events.js";
import { blindSeats, clockwiseFrom } from "./positions.js";
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
			// Betting arrives with POK-49: until then every action is refused.
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
