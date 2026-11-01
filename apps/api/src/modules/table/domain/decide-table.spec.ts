import {
	given,
	seatTaken,
	statusChanged,
	tableConfig,
	tableOpened,
	tableWith,
} from "../../../../test/support/table.js";
import type { TableEvent } from "./table-events.js";
import { MAX_SPECTATORS } from "./table-state.js";

/** A hand is being played, with these seats dealt in. */
const during = (...seats: number[]) => ({ hand: { handId: "hand-1", seats } });

const watching = (userId: string): TableEvent => ({
	type: "SpectatorJoined",
	v: 1,
	userId,
});

const chipsAdded = (
	seat: number,
	amount: number,
	reason: "rebuy" | "top-up",
): TableEvent => ({ type: "ChipsAdded", v: 1, seat, amount, reason });

/** u0 at seat 0 sits out, and has lost every chip in a hand (`broke`). */
const busted = [
	tableOpened(),
	seatTaken(0, 100),
	statusChanged(0, "sitting-out"),
];
const broke = { stacks: { 0: 0 } };

describe("decideTable", () => {
	describe("OpenTable", () => {
		it("opens a table with a copy of its config", () => {
			const config = tableConfig();

			const state = given([])
				.when({ type: "OpenTable", tableId: "table-1", config })
				.then([tableOpened()]);

			expect(state).toEqual({
				status: "open",
				tableId: "table-1",
				config,
				players: [],
				spectators: [],
				hand: null,
				positions: null,
				deck: null,
				turn: null,
			});
			expect(state.status !== "unopened" && state.config).not.toBe(config);
		});

		it("refuses an invalid config and an empty table id", () => {
			given([])
				.when({
					type: "OpenTable",
					tableId: "table-1",
					config: tableConfig({ maxSeats: 12 }),
				})
				.then({ code: "table.invalid-config", params: { reason: "seats" } });
			given([])
				.when({ type: "OpenTable", tableId: "", config: tableConfig() })
				.then({ code: "table.invalid-config", params: { reason: "table-id" } });
		});

		it("opens a table only once", () => {
			const open = {
				type: "OpenTable",
				tableId: "table-1",
				config: tableConfig(),
			} as const;

			given([tableOpened()]).when(open).then({ code: "table.already-open" });
			given([tableOpened(), { type: "TableClosed", v: 1 }])
				.when(open)
				.then({ code: "table.already-open" });
		});
	});

	describe("TakeSeat", () => {
		const takeSeat = (seat: number, buyIn = 200, userId = `u${seat}`) =>
			({ type: "TakeSeat", userId, verified: true, seat, buyIn }) as const;

		it("seats a player, who waits for the big blind", () => {
			const state = given(tableWith(0))
				.when(takeSeat(3, 150))
				.then([seatTaken(3, 150)]);

			expect(state.status !== "unopened" && state.players).toEqual([
				{
					seat: 0,
					userId: "u0",
					stack: 200,
					status: "waiting-for-big-blind",
					timeBankMs: 30_000,
					disconnectedAt: null,
					sitOut: null,
				},
				{
					seat: 3,
					userId: "u3",
					stack: 150,
					status: "waiting-for-big-blind",
					timeBankMs: 30_000,
					disconnectedAt: null,
					sitOut: null,
				},
			]);
		});

		it("keeps players in seat order", () => {
			const state = given(tableWith(4))
				.when(takeSeat(1))
				.then([seatTaken(1)]);

			expect(
				state.status !== "unopened" && state.players.map((p) => p.seat),
			).toEqual([1, 4]);
		});

		it("takes the minimum and the maximum buy-in, and seats in the first and last seat", () => {
			given(tableWith())
				.when(takeSeat(0, 100))
				.then([seatTaken(0, 100)]);
			given(tableWith())
				.when(takeSeat(5, 400))
				.then([seatTaken(5, 400)]);
		});

		it("seats a player during a hand", () => {
			given(tableWith(0, 1), during(0, 1))
				.when(takeSeat(2))
				.then([seatTaken(2)]);
		});

		it("stops a spectator watching once they sit down", () => {
			const state = given([tableOpened(), watching("u2"), watching("u7")])
				.when(takeSeat(2))
				.then([{ type: "SpectatorLeft", v: 1, userId: "u2" }, seatTaken(2)]);

			expect(state.status !== "unopened" && state.spectators).toEqual(["u7"]);
		});

		it("refuses a user whose email is not verified", () => {
			given(tableWith())
				.when({ ...takeSeat(0), verified: false })
				.then({ code: "table.not-verified" });
		});

		it("refuses a player who is already seated", () => {
			given(tableWith(2))
				.when(takeSeat(4, 200, "u2"))
				.then({ code: "table.already-seated", params: { seat: 2 } });
		});

		it.each([-1, 6, 1.5, Number.NaN])("refuses seat %d", (seat) => {
			given(tableWith())
				.when(takeSeat(seat, 200, "u9"))
				.then({
					code: "table.seat-out-of-range",
					params: { seat, maxSeats: 6 },
				});
		});

		it("refuses a taken seat", () => {
			given(tableWith(2))
				.when(takeSeat(2, 200, "u9"))
				.then({ code: "table.seat-taken", params: { seat: 2 } });
		});

		it.each([99, 401, 150.5, Number.NaN])("refuses a buy-in of %d", (buyIn) => {
			given(tableWith())
				.when(takeSeat(0, buyIn))
				.then({
					code: "table.buy-in-out-of-range",
					params: { min: 100, max: 400 },
				});
		});

		it("refuses before the table opens and after it closes", () => {
			given([]).when(takeSeat(0)).then({ code: "table.not-open" });
			given([tableOpened(), { type: "TableClosed", v: 1 }])
				.when(takeSeat(0))
				.then({ code: "table.closed" });
		});
	});

	describe("LeaveSeat", () => {
		it("frees the seat between hands", () => {
			const state = given(tableWith(0, 1))
				.when({ type: "LeaveSeat", userId: "u1" })
				.then([{ type: "SeatLeft", v: 1, seat: 1, userId: "u1" }]);

			expect(
				state.status !== "unopened" && state.players.map((p) => p.userId),
			).toEqual(["u0"]);
		});

		it("frees the seat at once for a player who is not dealt into the hand", () => {
			given(tableWith(0, 1, 2), during(0, 1))
				.when({ type: "LeaveSeat", userId: "u2" })
				.then([{ type: "SeatLeft", v: 1, seat: 2, userId: "u2" }]);
		});

		it("keeps the seat of a player dealt into the hand until it ends", () => {
			const state = given(tableWith(0, 1), during(0, 1))
				.when({ type: "LeaveSeat", userId: "u1" })
				.then([statusChanged(1, "leaving")]);

			expect(state.status !== "unopened" && state.players[1]?.status).toBe(
				"leaving",
			);
		});

		it("refuses a user who is not seated, and a player already leaving", () => {
			given(tableWith(0))
				.when({ type: "LeaveSeat", userId: "u9" })
				.then({ code: "table.not-seated" });
			given([...tableWith(0, 1), statusChanged(1, "leaving")], during(0, 1))
				.when({ type: "LeaveSeat", userId: "u1" })
				.then({ code: "table.leaving-seat" });
		});

		it("refuses before the table opens and after it closes", () => {
			given([])
				.when({ type: "LeaveSeat", userId: "u0" })
				.then({ code: "table.not-open" });
			given([tableOpened(), { type: "TableClosed", v: 1 }])
				.when({ type: "LeaveSeat", userId: "u0" })
				.then({ code: "table.closed" });
		});
	});

	describe("SitOut", () => {
		it("sits out a waiting or an active player", () => {
			given(tableWith(0))
				.when({ type: "SitOut", userId: "u0" })
				.then([statusChanged(0, "sitting-out")]);
			given([...tableWith(0), statusChanged(0, "active")])
				.when({ type: "SitOut", userId: "u0" })
				.then([statusChanged(0, "sitting-out")]);
		});

		it("sits out a player during their hand, from the next one", () => {
			given([...tableWith(0, 1), statusChanged(1, "active")], during(0, 1))
				.when({ type: "SitOut", userId: "u1" })
				.then([statusChanged(1, "sitting-out")]);
		});

		it("refuses a player already sitting out, one leaving, and one not seated", () => {
			given([...tableWith(0), statusChanged(0, "sitting-out")])
				.when({ type: "SitOut", userId: "u0" })
				.then({ code: "table.already-sitting-out" });
			given([...tableWith(0, 1), statusChanged(0, "leaving")], during(0, 1))
				.when({ type: "SitOut", userId: "u0" })
				.then({ code: "table.leaving-seat" });
			given(tableWith(0))
				.when({ type: "SitOut", userId: "u9" })
				.then({ code: "table.not-seated" });
		});
	});

	describe("SitIn", () => {
		it("brings a player back to wait for the big blind, so sitting out dodges no blind", () => {
			given([...tableWith(0), statusChanged(0, "sitting-out")])
				.when({ type: "SitIn", userId: "u0" })
				.then([statusChanged(0, "waiting-for-big-blind")]);
		});

		it("makes a player active again who sat out during a hand they are still in", () => {
			given([...tableWith(0, 1), statusChanged(1, "sitting-out")], during(0, 1))
				.when({ type: "SitIn", userId: "u1" })
				.then([statusChanged(1, "active")]);
		});

		it("refuses a player who is not sitting out", () => {
			given(tableWith(0))
				.when({ type: "SitIn", userId: "u0" })
				.then({ code: "table.not-sitting-out" });
			given([...tableWith(0), statusChanged(0, "active")])
				.when({ type: "SitIn", userId: "u0" })
				.then({ code: "table.not-sitting-out" });
		});

		it("refuses a player without chips: they rebuy first", () => {
			given(busted, broke)
				.when({ type: "SitIn", userId: "u0" })
				.then({ code: "table.no-chips" });
		});

		it("refuses a player leaving and one not seated", () => {
			given([...tableWith(0, 1), statusChanged(0, "leaving")], during(0, 1))
				.when({ type: "SitIn", userId: "u0" })
				.then({ code: "table.leaving-seat" });
			given(tableWith(0))
				.when({ type: "SitIn", userId: "u9" })
				.then({ code: "table.not-seated" });
		});
	});

	describe("Rebuy", () => {
		it("buys a busted player back in, within the buy-in range", () => {
			const state = given(busted, broke)
				.when({ type: "Rebuy", userId: "u0", amount: 400 })
				.then([chipsAdded(0, 400, "rebuy")]);

			expect(state.status !== "unopened" && state.players[0]).toEqual({
				seat: 0,
				userId: "u0",
				stack: 400,
				status: "sitting-out",
				timeBankMs: 30_000,
				disconnectedAt: null,
				sitOut: null,
			});
			given(busted, broke)
				.when({ type: "Rebuy", userId: "u0", amount: 100 })
				.then([chipsAdded(0, 100, "rebuy")]);
		});

		it("rebuys while a hand the player is not in is played", () => {
			given([...busted, seatTaken(1), seatTaken(2)], {
				...broke,
				...during(1, 2),
			})
				.when({ type: "Rebuy", userId: "u0", amount: 200 })
				.then([chipsAdded(0, 200, "rebuy")]);
		});

		it.each([99, 401, 120.5])("refuses a rebuy of %d", (amount) => {
			given(busted, broke)
				.when({ type: "Rebuy", userId: "u0", amount })
				.then({
					code: "table.buy-in-out-of-range",
					params: { min: 100, max: 400 },
				});
		});

		it("refuses a player who still has chips: they top up instead", () => {
			given(tableWith(0))
				.when({ type: "Rebuy", userId: "u0", amount: 200 })
				.then({ code: "table.not-busted" });
		});

		it("refuses a player who is not seated", () => {
			given(tableWith(0))
				.when({ type: "Rebuy", userId: "u9", amount: 200 })
				.then({ code: "table.not-seated" });
		});
	});

	describe("TopUp", () => {
		it("adds chips up to the maximum buy-in", () => {
			const state = given(tableWith(0))
				.when({ type: "TopUp", userId: "u0", amount: 200 })
				.then([chipsAdded(0, 200, "top-up")]);

			expect(state.status !== "unopened" && state.players[0]?.stack).toBe(400);
			given(tableWith(0))
				.when({ type: "TopUp", userId: "u0", amount: 1 })
				.then([chipsAdded(0, 1, "top-up")]);
		});

		it.each([0, 201, 2.5])(
			"refuses a top-up of %d past what the stack has room for",
			(amount) => {
				given(tableWith(0))
					.when({ type: "TopUp", userId: "u0", amount })
					.then({
						code: "table.buy-in-out-of-range",
						params: { min: 1, max: 200 },
					});
			},
		);

		it("refuses a stack at or past the maximum buy-in", () => {
			given([tableOpened(), seatTaken(0, 400)])
				.when({ type: "TopUp", userId: "u0", amount: 1 })
				.then({ code: "table.stack-full", params: { max: 400 } });
			given([tableOpened(), seatTaken(0, 400), chipsAdded(0, 150, "top-up")])
				.when({ type: "TopUp", userId: "u0", amount: 1 })
				.then({ code: "table.stack-full", params: { max: 400 } });
		});

		it("refuses a busted player: they rebuy instead", () => {
			given(busted, broke)
				.when({ type: "TopUp", userId: "u0", amount: 100 })
				.then({ code: "table.no-chips" });
		});

		it("refuses during the player's hand, whose stack is in play", () => {
			given(tableWith(0, 1), during(0, 1))
				.when({ type: "TopUp", userId: "u0", amount: 100 })
				.then({ code: "table.in-hand" });
		});

		it("refuses a player leaving", () => {
			given([...tableWith(0, 1), statusChanged(0, "leaving")], during(0, 1))
				.when({ type: "TopUp", userId: "u0", amount: 100 })
				.then({ code: "table.leaving-seat" });
		});
	});

	describe("JoinAsSpectator and LeaveSpectating", () => {
		it("lets a user watch, and stop watching", () => {
			const watched = given(tableWith(0))
				.when({ type: "JoinAsSpectator", userId: "u5" })
				.then([watching("u5")]);

			expect(watched.status !== "unopened" && watched.spectators).toEqual([
				"u5",
			]);

			const left = given([...tableWith(0), watching("u5")])
				.when({ type: "LeaveSpectating", userId: "u5" })
				.then([{ type: "SpectatorLeft", v: 1, userId: "u5" }]);

			expect(left.status !== "unopened" && left.spectators).toEqual([]);
		});

		it("refuses a seated player, and a user already watching", () => {
			given(tableWith(3))
				.when({ type: "JoinAsSpectator", userId: "u3" })
				.then({ code: "table.already-seated", params: { seat: 3 } });
			given([...tableWith(), watching("u5")])
				.when({ type: "JoinAsSpectator", userId: "u5" })
				.then({ code: "table.already-spectating" });
		});

		it(`lets at most ${MAX_SPECTATORS} users watch`, () => {
			const crowd = Array.from({ length: MAX_SPECTATORS }, (_, i) =>
				watching(`s${i}`),
			);

			given([...tableWith(), ...crowd.slice(1)])
				.when({ type: "JoinAsSpectator", userId: "s0" })
				.then([watching("s0")]);
			given([...tableWith(), ...crowd])
				.when({ type: "JoinAsSpectator", userId: "u9" })
				.then({
					code: "table.spectators-full",
					params: { max: MAX_SPECTATORS },
				});
		});

		it("refuses to stop watching for a user who is not", () => {
			given(tableWith())
				.when({ type: "LeaveSpectating", userId: "u5" })
				.then({ code: "table.not-spectating" });
		});

		it("refuses before the table opens and after it closes", () => {
			given([])
				.when({ type: "JoinAsSpectator", userId: "u5" })
				.then({ code: "table.not-open" });
			given([tableOpened(), { type: "TableClosed", v: 1 }])
				.when({ type: "LeaveSpectating", userId: "u5" })
				.then({ code: "table.closed" });
		});
	});

	describe("CloseTable", () => {
		it("lets every player and spectator leave, then closes", () => {
			const state = given([...tableWith(0, 4), watching("u7")])
				.when({ type: "CloseTable" })
				.then([
					{ type: "SeatLeft", v: 1, seat: 0, userId: "u0" },
					{ type: "SeatLeft", v: 1, seat: 4, userId: "u4" },
					{ type: "SpectatorLeft", v: 1, userId: "u7" },
					{ type: "TableClosed", v: 1 },
				]);

			expect(state).toMatchObject({
				status: "closed",
				players: [],
				spectators: [],
			});
		});

		it("closes an empty table", () => {
			given(tableWith())
				.when({ type: "CloseTable" })
				.then([{ type: "TableClosed", v: 1 }]);
		});

		it("refuses during a hand, before the table opens and once it is closed", () => {
			given(tableWith(0, 1), during(0, 1))
				.when({ type: "CloseTable" })
				.then({ code: "table.hand-in-progress" });
			given([]).when({ type: "CloseTable" }).then({ code: "table.not-open" });
			given([tableOpened(), { type: "TableClosed", v: 1 }])
				.when({ type: "CloseTable" })
				.then({ code: "table.closed" });
		});
	});
});
