import type { Chips, SeatIndex } from "./config.js";
import type { Pot } from "./events.js";

/** Every chip one player has put in this hand so far: antes, blinds and bets. */
export interface Contribution {
	readonly seat: SeatIndex;
	readonly amount: Chips;
}

const sameSeats = (a: readonly SeatIndex[], b: readonly SeatIndex[]) =>
	a.length === b.length && a.every((seat, index) => seat === b[index]);

/** The same pots: equal amounts, won by the same players. */
export const samePots = (a: readonly Pot[], b: readonly Pot[]) =>
	a.length === b.length &&
	a.every((pot, index) => {
		const other = b[index] as Pot;
		return (
			pot.amount === other.amount &&
			sameSeats(pot.eligibleSeats, other.eligibleSeats)
		);
	});

/**
 * Splits the chips put in into the main pot and side pots (RULES §9): each distinct contribution
 * makes a layer of up to that much from every player, and only the players still in who put in at
 * least that much can win it. Folded players' chips stay in the pots they reached. Adjacent layers
 * with the same players merge, so a pot appears only where an all-in changes who can win. Chips
 * above what any player still in put in (a folded player's raise, never matched) join the top pot.
 */
export function buildPots(
	contributions: readonly Contribution[],
	foldedSeats: readonly SeatIndex[],
): Pot[] {
	const folded = new Set(foldedSeats);
	const levels = [
		...new Set(contributions.map((contribution) => contribution.amount)),
	]
		.filter((amount) => amount > 0)
		.sort((a, b) => a - b);
	const pots: Pot[] = [];
	let floor = 0;
	for (const level of levels) {
		const amount = contributions.reduce(
			(sum, contribution) =>
				sum + Math.max(0, Math.min(contribution.amount, level) - floor),
			0,
		);
		const eligibleSeats = contributions
			.filter(
				(contribution) =>
					!folded.has(contribution.seat) && contribution.amount >= level,
			)
			.map((contribution) => contribution.seat)
			.sort((a, b) => a - b);
		const top = pots.at(-1);
		if (
			top &&
			(eligibleSeats.length === 0 ||
				sameSeats(top.eligibleSeats, eligibleSeats))
		) {
			pots[pots.length - 1] = {
				amount: top.amount + amount,
				eligibleSeats: top.eligibleSeats,
			};
		} else {
			pots.push({ amount, eligibleSeats });
		}
		floor = level;
	}
	return pots;
}
