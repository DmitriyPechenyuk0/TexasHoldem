import fc from "fast-check";
import { validateConfig } from "../hand/decide.js";
import { handConfig } from "../testing/hand-fixtures.js";
import {
	firstHandPositions,
	type HandPositions,
	nextHandPositions,
	type SeatedPlayer,
} from "./rotation.js";

// RULES §3, §4 (dead button, TDA 32) and heads-up (TDA 34-B).

const active = (...seats: number[]): SeatedPlayer[] =>
	seats.map((seat) => ({ seat, waiting: false }));
const waiting = (seat: number): SeatedPlayer => ({ seat, waiting: true });

/** Whether the engine can start a hand at these positions. */
const startable = (positions: HandPositions) =>
	validateConfig(
		handConfig({
			players: positions.dealtIn.map((seat) => ({
				seat,
				playerId: `p${seat}`,
				stack: 1000,
			})),
			buttonSeat: positions.buttonSeat,
			smallBlindSeat: positions.smallBlindSeat,
			bigBlindSeat: positions.bigBlindSeat,
		}),
	) === null;

// Six-handed, seats 0–5: button 0, small blind 1, big blind 2.
const sixHanded = { buttonSeat: 0, smallBlindSeat: 1, bigBlindSeat: 2 };

describe("firstHandPositions", () => {
	it("puts the blinds on the two players left of the drawn button", () => {
		expect(firstHandPositions([5, 0, 2], 2)).toEqual({
			buttonSeat: 2,
			smallBlindSeat: 5,
			bigBlindSeat: 0,
			dealtIn: [0, 2, 5],
		});
	});

	it("heads-up, the button posts the small blind", () => {
		expect(firstHandPositions([3, 7], 7)).toMatchObject({
			buttonSeat: 7,
			smallBlindSeat: 7,
			bigBlindSeat: 3,
		});
	});

	it("needs two players", () => {
		expect(firstHandPositions([4], 4)).toBeNull();
	});
});

describe("nextHandPositions (dead button)", () => {
	it("moves the button and both blinds one seat clockwise", () => {
		const next = nextHandPositions(sixHanded, active(0, 1, 2, 3, 4, 5));
		expect(next).toEqual({
			buttonSeat: 1,
			smallBlindSeat: 2,
			bigBlindSeat: 3,
			dealtIn: [0, 1, 2, 3, 4, 5],
		});
		expect(startable(next!)).toBe(true);
	});

	it("wraps around the table", () => {
		const next = nextHandPositions(
			{ smallBlindSeat: 4, bigBlindSeat: 5 },
			active(0, 1, 2, 3, 4, 5),
		);
		expect(next).toMatchObject({
			buttonSeat: 4,
			smallBlindSeat: 5,
			bigBlindSeat: 0,
		});
	});

	it("when the big blind leaves, the next player still posts the big blind and the small blind is dead", () => {
		const next = nextHandPositions(sixHanded, active(0, 1, 3, 4, 5));
		expect(next).toEqual({
			buttonSeat: 1,
			smallBlindSeat: 2,
			bigBlindSeat: 3,
			dealtIn: [0, 1, 3, 4, 5],
		});
		expect(startable(next!)).toBe(true);
	});

	it("when the small blind leaves, the button is dead on the empty seat", () => {
		const next = nextHandPositions(sixHanded, active(0, 2, 3, 4, 5));
		expect(next).toMatchObject({
			buttonSeat: 1,
			smallBlindSeat: 2,
			bigBlindSeat: 3,
		});
		expect(startable(next!)).toBe(true);
	});

	it("when two players leave, the big blind skips both empty seats", () => {
		const next = nextHandPositions(sixHanded, active(0, 1, 4, 5));
		expect(next).toMatchObject({
			buttonSeat: 1,
			smallBlindSeat: 2,
			bigBlindSeat: 4,
		});
		expect(startable(next!)).toBe(true);
	});

	it("three to heads-up: the last big blind becomes the button and nobody posts it twice", () => {
		// Button 0, blinds 1 and 2; the small blind leaves.
		const three = { buttonSeat: 0, smallBlindSeat: 1, bigBlindSeat: 2 };
		expect(nextHandPositions(three, active(0, 2))).toEqual({
			buttonSeat: 2,
			smallBlindSeat: 2,
			bigBlindSeat: 0,
			dealtIn: [0, 2],
		});
		// The big blind leaves instead: the button posts the big blind, the small blind the button.
		expect(nextHandPositions(three, active(0, 1))).toMatchObject({
			buttonSeat: 1,
			smallBlindSeat: 1,
			bigBlindSeat: 0,
		});
	});

	it("heads-up alternates the button and the big blind", () => {
		const first = firstHandPositions([0, 1], 0)!;
		const second = nextHandPositions(first, active(0, 1));
		expect(second).toMatchObject({
			buttonSeat: 1,
			smallBlindSeat: 1,
			bigBlindSeat: 0,
		});
		expect(nextHandPositions(second!, active(0, 1))).toMatchObject({
			buttonSeat: 0,
			bigBlindSeat: 1,
		});
	});

	it("heads-up to three: a new player behind the big blind is dealt in on the big blind", () => {
		const headsUp = { buttonSeat: 0, smallBlindSeat: 0, bigBlindSeat: 1 };
		const next = nextHandPositions(headsUp, [...active(0, 1), waiting(4)]);
		expect(next).toEqual({
			buttonSeat: 0,
			smallBlindSeat: 1,
			bigBlindSeat: 4,
			dealtIn: [0, 1, 4],
		});
		expect(startable(next!)).toBe(true);
	});

	it("a new player waits for the big blind, sitting out until it reaches their seat", () => {
		// Seat 5 sits down two seats behind the big blind.
		const seated = [...active(0, 1, 2, 3, 4), waiting(5)];
		const next = nextHandPositions(sixHanded, seated);
		expect(next).toMatchObject({ bigBlindSeat: 3, dealtIn: [0, 1, 2, 3, 4] });
		const after = nextHandPositions(next!, seated);
		expect(after).toMatchObject({ bigBlindSeat: 4, dealtIn: [0, 1, 2, 3, 4] });
		expect(nextHandPositions(after!, seated)).toEqual({
			buttonSeat: 3,
			smallBlindSeat: 4,
			bigBlindSeat: 5,
			dealtIn: [0, 1, 2, 3, 4, 5],
		});
	});

	it("returns null when fewer than two players can be dealt in", () => {
		expect(nextHandPositions(sixHanded, [])).toBeNull();
		expect(nextHandPositions(sixHanded, active(4))).toBeNull();
		// The big blind reaches seat 3 before the newcomer on seat 5: one player, so no hand.
		expect(nextHandPositions(sixHanded, [...active(3), waiting(5)])).toBeNull();
	});

	it("keeps every hand startable while players come and go", () => {
		const change = fc.record({
			leave: fc.array(fc.nat(9), { maxLength: 3 }),
			join: fc.array(fc.nat(9), { maxLength: 3 }),
			drawn: fc.nat(9),
		});
		fc.assert(
			fc.property(
				fc.uniqueArray(fc.nat(9), { minLength: 2, maxLength: 10 }),
				fc.nat(9),
				fc.array(change, { minLength: 1, maxLength: 40 }),
				(seats, drawn, changes) => {
					let seated: SeatedPlayer[] = active(...seats);
					let positions = firstHandPositions(
						seats,
						seats[drawn % seats.length]!,
					);
					for (const { leave, join, drawn: redraw } of changes) {
						const previous = positions!;
						// After a hand everyone dealt in is a regular; then some leave and others sit down.
						seated = seated
							.map(({ seat, waiting }) => ({
								seat,
								waiting: waiting && !previous.dealtIn.includes(seat),
							}))
							.filter(({ seat }) => !leave.includes(seat));
						for (const seat of join) {
							if (!seated.some((player) => player.seat === seat)) {
								seated.push(waiting(seat));
							}
						}

						positions = nextHandPositions(previous, seated);
						if (!positions) {
							// No game to wait for: the table starts over once two players sit.
							if (seated.length < 2) return;
							seated = active(...seated.map((player) => player.seat));
							const all = seated.map((player) => player.seat);
							positions = firstHandPositions(all, all[redraw % all.length]!);
							expect(startable(positions!)).toBe(true);
							continue;
						}
						expect(startable(positions)).toBe(true);
						expect(positions.bigBlindSeat).not.toBe(previous.bigBlindSeat);
						// Only a newcomer the big blind reached is dealt in.
						for (const { seat, waiting } of seated) {
							expect(positions.dealtIn.includes(seat)).toBe(
								!waiting || seat === positions.bigBlindSeat,
							);
						}
					}
				},
			),
			{ numRuns: 500 },
		);
	});
});
