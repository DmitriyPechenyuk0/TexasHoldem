import type { SeatIndex } from "../hand/config.js";
import { blindSeats, clockwiseFrom } from "../hand/positions.js";

/** A player sitting at the table between hands. */
export interface SeatedPlayer {
	readonly seat: SeatIndex;
	/**
	 * Sat down since the last hand. A new player waits for the big blind: they are dealt in when
	 * the big blind reaches their seat, and sit out until then. Posting to play earlier is not
	 * offered.
	 */
	readonly waiting: boolean;
}

/** Where the button and the blinds are for a hand, and who is dealt in. */
export interface HandPositions {
	/** May be an empty seat: a dead button. */
	readonly buttonSeat: SeatIndex;
	/** May be an empty seat, or a player not dealt in: a dead small blind that nobody posts. */
	readonly smallBlindSeat: SeatIndex;
	readonly bigBlindSeat: SeatIndex;
	/** The seats dealt in, in seat order. */
	readonly dealtIn: readonly SeatIndex[];
}

/**
 * Heads-up the button posts the small blind and the other player the big blind (TDA 34-B). The big
 * blind is placed first, so nobody posts it twice in a row when play becomes heads-up.
 */
function headsUp(bigBlindSeat: SeatIndex, dealtIn: SeatIndex[]): HandPositions {
	const button = dealtIn.find((seat) => seat !== bigBlindSeat) as SeatIndex;
	return {
		buttonSeat: button,
		smallBlindSeat: button,
		bigBlindSeat,
		dealtIn,
	};
}

/**
 * The positions of a table's first hand, with the button where the table drew it (RULES §3). Every
 * seated player is dealt in. Null with fewer than two players.
 */
export function firstHandPositions(
	seats: readonly SeatIndex[],
	buttonSeat: SeatIndex,
): HandPositions | null {
	if (seats.length < 2) {
		return null;
	}
	const dealtIn = seats.toSorted((a, b) => a - b);
	const blinds = blindSeats(
		dealtIn.map((seat) => ({ seat })),
		buttonSeat,
	);
	return {
		buttonSeat,
		smallBlindSeat: blinds.smallBlind,
		bigBlindSeat: blinds.bigBlind,
		dealtIn,
	};
}

/**
 * The positions of the next hand under the dead button rule (RULES §4, TDA 32), which works for
 * players joining and leaving between hands: the big blind moves forward exactly one seated
 * player, so nobody skips it or posts it twice in a row. The small blind goes where the big blind
 * was and the button where the small blind was, even when those players have left: then the small
 * blind is dead and nobody posts it, or the button sits on an empty seat. Null when fewer than two
 * players can be dealt in.
 */
export function nextHandPositions(
	previous: Pick<HandPositions, "smallBlindSeat" | "bigBlindSeat">,
	seated: readonly SeatedPlayer[],
): HandPositions | null {
	const bigBlind = clockwiseFrom(seated, previous.bigBlindSeat)[0];
	const dealtIn = seated
		.filter((player) => !player.waiting || player.seat === bigBlind?.seat)
		.map((player) => player.seat)
		.toSorted((a, b) => a - b);
	if (!bigBlind || dealtIn.length < 2) {
		return null;
	}
	if (dealtIn.length === 2) {
		return headsUp(bigBlind.seat, dealtIn);
	}
	return {
		buttonSeat: previous.smallBlindSeat,
		smallBlindSeat: previous.bigBlindSeat,
		bigBlindSeat: bigBlind.seat,
		dealtIn,
	};
}
