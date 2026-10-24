import type { SeatIndex } from "./config.js";

interface Seated {
	readonly seat: SeatIndex;
}

/**
 * The players in clockwise order starting with the first seat to the left of `seat` (the next
 * higher seat number, wrapping around). `seat` itself, if taken, comes last.
 */
export function clockwiseFrom<Player extends Seated>(
	players: readonly Player[],
	seat: SeatIndex,
): Player[] {
	const sorted = players.toSorted((a, b) => a.seat - b.seat);
	const start = sorted.findIndex((player) => player.seat > seat);
	return start < 0
		? sorted
		: [...sorted.slice(start), ...sorted.slice(0, start)];
}

export interface BlindSeats {
	readonly smallBlind: SeatIndex;
	readonly bigBlind: SeatIndex;
}

/**
 * Who posts the blinds (RULES §3, §4): the two seats left of the button. Heads-up, the button
 * posts the small blind and the other player the big blind (TDA 34-B).
 */
export function blindSeats(
	players: readonly Seated[],
	buttonSeat: SeatIndex,
): BlindSeats {
	const order = clockwiseFrom(players, buttonSeat);
	const [first, second] = order as [Seated, Seated];
	return order.length === 2
		? { smallBlind: second.seat, bigBlind: first.seat }
		: { smallBlind: first.seat, bigBlind: second.seat };
}
