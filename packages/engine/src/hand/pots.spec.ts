import fc from "fast-check";
import { buildPots, type Contribution } from "./pots.js";

/** Seats 0, 1, 2… put in these amounts. */
const putIn = (...amounts: number[]): Contribution[] =>
	amounts.map((amount, seat) => ({ seat, amount }));

const sum = (amounts: readonly number[]) =>
	amounts.reduce((total, amount) => total + amount, 0);

describe("buildPots (RULES §9)", () => {
	it.each([
		{
			name: "heads-up, both in for the same: one pot",
			contributions: putIn(100, 100),
			folded: [],
			pots: [{ amount: 200, eligibleSeats: [0, 1] }],
		},
		{
			name: "RULES §9 example: A all-in for 100, B all-in for 300, C calls 300",
			contributions: putIn(100, 300, 300),
			folded: [],
			pots: [
				{ amount: 300, eligibleSeats: [0, 1, 2] },
				{ amount: 400, eligibleSeats: [1, 2] },
			],
		},
		{
			name: "a folded blind's chips stay in the pot, but it cannot win them",
			contributions: putIn(50, 100, 100),
			folded: [0],
			pots: [{ amount: 250, eligibleSeats: [1, 2] }],
		},
		{
			name: "a player who folds after putting in more than an all-in can win nothing",
			contributions: putIn(100, 300, 300),
			folded: [1],
			pots: [
				{ amount: 300, eligibleSeats: [0, 2] },
				{ amount: 400, eligibleSeats: [2] },
			],
		},
		{
			name: "six players, three all-ins at different levels and a folded blind",
			contributions: putIn(50, 120, 300, 500, 500, 20),
			folded: [5],
			pots: [
				{ amount: 270, eligibleSeats: [0, 1, 2, 3, 4] },
				{ amount: 280, eligibleSeats: [1, 2, 3, 4] },
				{ amount: 540, eligibleSeats: [2, 3, 4] },
				{ amount: 400, eligibleSeats: [3, 4] },
			],
		},
		{
			name: "nine players, two folded early: one pot for the seven still in",
			contributions: putIn(10, 10, 200, 200, 200, 200, 200, 200, 200),
			folded: [0, 1],
			pots: [{ amount: 1420, eligibleSeats: [2, 3, 4, 5, 6, 7, 8] }],
		},
		{
			name: "chips above everyone still in join the top pot",
			contributions: putIn(100, 100, 150),
			folded: [2],
			pots: [{ amount: 350, eligibleSeats: [0, 1] }],
		},
		{
			name: "a player who put in nothing makes no pot",
			contributions: putIn(0, 100, 100),
			folded: [0],
			pots: [{ amount: 200, eligibleSeats: [1, 2] }],
		},
		{
			name: "nothing put in: no pots",
			contributions: putIn(0, 0),
			folded: [],
			pots: [],
		},
		{
			name: "eligible seats come in seat order, whatever the order given",
			contributions: [
				{ seat: 7, amount: 300 },
				{ seat: 2, amount: 100 },
				{ seat: 4, amount: 300 },
			],
			folded: [],
			pots: [
				{ amount: 300, eligibleSeats: [2, 4, 7] },
				{ amount: 400, eligibleSeats: [4, 7] },
			],
		},
	])("$name", ({ contributions, folded, pots }) => {
		expect(buildPots(contributions, folded)).toEqual(pots);
	});

	it("keeps every chip, and never lets a player win more from anyone than they put in", () => {
		fc.assert(
			fc.property(
				fc.array(fc.record({ amount: fc.nat(1000), folded: fc.boolean() }), {
					minLength: 2,
					maxLength: 10,
				}),
				(players) => {
					const contributions = players.map(({ amount }, seat) => ({
						seat,
						amount,
					}));
					const folded = players.flatMap((player, seat) =>
						player.folded ? [seat] : [],
					);
					const live = contributions.filter(
						({ seat }) => !folded.includes(seat),
					);
					const liveMax = Math.max(0, ...live.map(({ amount }) => amount));
					fc.pre(liveMax > 0);

					const pots = buildPots(contributions, folded);
					const amounts = contributions.map(({ amount }) => amount);
					expect(sum(pots.map((pot) => pot.amount))).toBe(sum(amounts));

					// Each pot has fewer players than the one below it, and nobody who folded.
					pots.forEach((pot, index) => {
						expect(pot.amount).toBeGreaterThan(0);
						expect(
							pot.eligibleSeats.some((seat) => folded.includes(seat)),
						).toBe(false);
						const below = pots[index - 1];
						if (below) {
							expect(pot.eligibleSeats.length).toBeLessThan(
								below.eligibleSeats.length,
							);
							expect(
								pot.eligibleSeats.every((seat) =>
									below.eligibleSeats.includes(seat),
								),
							).toBe(true);
						}
					});

					// A player wins at most what each opponent matched of their own amount; only the
					// biggest stake still in can also take chips a folded player put in above it.
					const excess = sum(
						amounts.map((amount) => Math.max(0, amount - liveMax)),
					);
					for (const player of live) {
						const winnable = sum(
							pots
								.filter((pot) => pot.eligibleSeats.includes(player.seat))
								.map((pot) => pot.amount),
						);
						expect(winnable).toBe(
							sum(amounts.map((amount) => Math.min(amount, player.amount))) +
								(player.amount === liveMax ? excess : 0),
						);
					}
				},
			),
			{ numRuns: 500 },
		);
	});
});
