import type { Card } from "../cards/index.js";
import { type LegalActions, legalActions } from "./betting.js";
import type { Chips, SeatIndex } from "./config.js";
import type { HandEvent, Pot, Street } from "./events.js";
import type { HandState, PlayerState } from "./state.js";

// What one client may see of a hand. Hidden cards never leave the server: the deck order, the burn
// cards and the hole cards of other players until they are shown. Cards only ever appear under the
// keys `holeCards`, `cards` and `board`.

/** A seated player, or someone watching the table. */
export type Viewer = SeatIndex | "spectator";

export interface PlayerSeatView {
	readonly seat: SeatIndex;
	readonly playerId: string;
	readonly stack: Chips;
	readonly bet: Chips;
	readonly committed: Chips;
	/** Dealt cards this hand, face down to everyone else until shown. */
	readonly hasCards: boolean;
	/** The cards, when this viewer may see them: their own, or ones shown at the showdown. */
	readonly holeCards: readonly [Card, Card] | null;
	readonly folded: boolean;
	readonly allIn: boolean;
	readonly shown: boolean;
	readonly mucked: boolean;
}

export type PlayerView =
	| { readonly status: "idle"; readonly viewer: Viewer }
	| {
			readonly status: "in-progress" | "ended";
			readonly viewer: Viewer;
			readonly handId: string;
			readonly smallBlind: Chips;
			readonly bigBlind: Chips;
			readonly ante: Chips;
			readonly buttonSeat: SeatIndex;
			readonly smallBlindSeat: SeatIndex;
			readonly bigBlindSeat: SeatIndex;
			readonly players: readonly PlayerSeatView[];
			readonly board: readonly Card[];
			readonly street: Street | "showdown";
			readonly toAct: SeatIndex | null;
			readonly currentBet: Chips;
			readonly minRaise: Chips;
			readonly pots: readonly Pot[];
			/** What the viewer may do, when it is their turn to bet. */
			readonly legalActions: LegalActions | null;
	  };

/** Whether this viewer may see the player's hole cards. */
const visibleTo = (player: PlayerState, viewer: Viewer) =>
	player.seat === viewer || player.shown;

/** The hand as this viewer may see it (ADR-002): no deck, and no hidden hole cards. */
export function toPlayerView(state: HandState, viewer: Viewer): PlayerView {
	if (state.status === "idle") {
		return { status: "idle", viewer };
	}
	return {
		status: state.status,
		viewer,
		handId: state.handId,
		smallBlind: state.smallBlind,
		bigBlind: state.bigBlind,
		ante: state.ante,
		buttonSeat: state.buttonSeat,
		smallBlindSeat: state.smallBlindSeat,
		bigBlindSeat: state.bigBlindSeat,
		players: state.players.map((player) => ({
			seat: player.seat,
			playerId: player.playerId,
			stack: player.stack,
			bet: player.bet,
			committed: player.committed,
			hasCards: player.holeCards !== null,
			holeCards: visibleTo(player, viewer) ? player.holeCards : null,
			folded: player.folded,
			allIn: player.allIn,
			shown: player.shown,
			mucked: player.mucked,
		})),
		board: state.board,
		street: state.street,
		toAct: state.toAct,
		currentBet: state.currentBet,
		minRaise: state.minRaise,
		pots: state.pots.map(({ amount, eligibleSeats }) => ({
			amount,
			eligibleSeats,
		})),
		legalActions: viewer === "spectator" ? null : legalActions(state, viewer),
	};
}

type EventOf<Type extends HandEvent["type"]> = Extract<
	HandEvent,
	{ type: Type }
>;

/** An event as a client receives it. */
export type PlayerEvent =
	| Omit<EventOf<"HandStarted">, "deck">
	| {
			readonly type: "HoleCardsDealt";
			readonly v: 1;
			/** Every player dealt in; only the viewer's own cards are filled in. */
			readonly hands: readonly {
				readonly seat: SeatIndex;
				readonly cards: readonly [Card, Card] | null;
			}[];
	  }
	| Omit<EventOf<"StreetDealt">, "burn">
	| Exclude<
			HandEvent,
			{ type: "HandStarted" | "HoleCardsDealt" | "StreetDealt" }
	  >;

/**
 * An event with what this viewer may not see taken out: the deck order, the burn cards and other
 * players' hole cards. Cards shown at the showdown are public, so `CardsShown` passes as it is.
 */
export function redactEvent(event: HandEvent, viewer: Viewer): PlayerEvent {
	switch (event.type) {
		case "HandStarted": {
			const { deck: _deck, ...rest } = event;
			return rest;
		}
		case "HoleCardsDealt":
			return {
				...event,
				hands: event.hands.map(({ seat, cards }) => ({
					seat,
					cards: seat === viewer ? cards : null,
				})),
			};
		case "StreetDealt": {
			const { burn: _burn, ...rest } = event;
			return rest;
		}
		// Public as they are. No default: a new event type must be classified here to compile.
		case "AntePosted":
		case "BlindPosted":
		case "PlayerActed":
		case "UncalledBetReturned":
		case "ShowdownStarted":
		case "PotsCollected":
		case "CardsShown":
		case "CardsMucked":
		case "PotAwarded":
		case "HandEnded":
			return event;
	}
}
