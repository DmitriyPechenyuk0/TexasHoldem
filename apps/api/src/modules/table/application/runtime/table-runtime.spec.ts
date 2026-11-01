import { bytesToHex } from "@holdem/engine";
import { Logger } from "@nestjs/common";
import { InMemoryEventStore } from "../../../../../test/support/in-memory-event-store.js";
import { seatTaken, tableConfig } from "../../../../../test/support/table.js";
import {
	FIXED_SEED,
	FixedDeckProvider,
} from "../../../../../test/support/table-ports.js";
import { ConcurrencyError } from "@/shared/application/event-store.js";
import type { TableCommandInput } from "../commands/execute-table-command/execute-table-command.command.js";
import type { TableChanged } from "../events/table-changed.event.js";
import type { TableStreamEvent } from "../game-streams.js";
import { TableRuntime } from "./table-runtime.js";

const HAND_PAUSE_MS = 3_000;

/** `fakeClock`: read the time from vi's fake timers, which turn timers need. */
function setUp({ fakeClock = false } = {}) {
	const store = new InMemoryEventStore<TableStreamEvent>();
	const decks = new FixedDeckProvider();
	const published: TableChanged[] = [];
	let now = 0;
	const runtime = new TableRuntime("t-1", {
		store,
		decks,
		publish: (change) => published.push(change),
		options: { handPauseMs: HAND_PAUSE_MS, idleMs: 60_000 },
		now: () => (fakeClock ? Date.now() : now),
	});
	return {
		store,
		decks,
		published,
		runtime,
		setNow: (ms: number) => {
			now = ms;
		},
	};
}

const open: TableCommandInput = {
	type: "OpenTable",
	tableId: "t-1",
	config: tableConfig(),
};
const takeSeat = (seat: number): TableCommandInput => ({
	type: "TakeSeat",
	userId: `u${seat}`,
	verified: true,
	seat,
	buyIn: 200,
});
const spectators = Array.from({ length: 50 }, (_, i) => `s${i}`);

describe("TableRuntime", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("runs 100 commands sent at once one at a time, in the order they came", async () => {
		const { store, runtime } = setUp();
		await runtime.execute(open);

		// Each spectator joins, then leaves: only in order can every one of these be accepted.
		const commands = spectators.flatMap((userId) => [
			{ type: "JoinAsSpectator" as const, userId },
			{ type: "LeaveSpectating" as const, userId },
		]);
		const outcomes = await Promise.allSettled(
			commands.map((command) => runtime.execute(command)),
		);

		expect(outcomes.every((o) => o.status === "fulfilled")).toBe(true);
		const stream = await store.readStream("table-t-1");
		expect(stream.map((r) => r.version)).toEqual(
			Array.from({ length: 101 }, (_, i) => i + 1),
		);
		expect(stream.slice(1).map(({ event }) => event)).toEqual(
			commands.map(({ type, userId }) => ({
				type: type === "JoinAsSpectator" ? "SpectatorJoined" : "SpectatorLeft",
				v: 1,
				userId,
			})),
		);
	});

	it("folds the streams once, then keeps the state in memory", async () => {
		const { store, runtime } = setUp();
		const reads = vi.spyOn(store, "readStream");

		await runtime.execute(open);
		await runtime.execute(takeSeat(0));
		await runtime.execute(takeSeat(1));

		expect(reads).toHaveBeenCalledTimes(1);
	});

	it("publishes each change with the streams' versions and the state, in order", async () => {
		const { published, runtime } = setUp();

		await runtime.execute(open, { userId: "admin" });
		await runtime.execute(takeSeat(0));

		expect(
			published.map(({ tableId, versions, events }) => ({
				tableId,
				tableVersion: versions.tableVersion,
				events,
			})),
		).toEqual([
			{
				tableId: "t-1",
				tableVersion: 1,
				events: {
					table: [expect.objectContaining({ type: "TableOpened" })],
					hand: [],
				},
			},
			{
				tableId: "t-1",
				tableVersion: 2,
				events: { table: [seatTaken(0)], hand: [] },
			},
		]);
		expect(published[1]?.state.table).toMatchObject({
			status: "open",
			players: [{ seat: 0, userId: "u0" }],
		});
	});

	it("keeps following the last hand's stream between hands, and shows the table through view()", async () => {
		vi.useFakeTimers();
		const { published, runtime } = setUp();
		await runtime.execute(open);
		await runtime.execute(takeSeat(0));
		await runtime.execute(takeSeat(1));
		expect(published.at(-1)?.versions.hand).toBeNull();

		await runtime.dealNextHand();
		const dealt = published.at(-1)!;
		const handId = dealt.versions.hand?.handId;
		expect(dealt.versions.hand?.version).toBe(dealt.events.hand.length);

		// Heads-up, the button (seat 0) acts first: folding ends the hand.
		await runtime.execute({ type: "Act", userId: "u0", action: "fold" });
		const settled = published.at(-1)!;
		await runtime.execute({ type: "SitOut", userId: "u1" });
		// The deck was revealed in between, right after the hand ended.
		const [revealed, satOut] = published.slice(-2);
		expect(revealed?.events.table.map((e) => e.type)).toEqual(["DeckRevealed"]);
		// One for the reveal, and two for sitting out: the status and the sit-out clock.
		expect(satOut?.versions).toEqual({
			tableVersion: settled.versions.tableVersion + 3,
			hand: settled.versions.hand,
		});
		expect(settled.versions.hand).toEqual({
			handId,
			version: dealt.events.hand.length + settled.events.hand.length,
		});

		const view = await runtime.view();
		expect(view.handId).toBe(handId);
		expect(view.state.hand.status).toBe("ended");
	});

	it("reveals each hand's deck once it has ended, before the next is dealt", async () => {
		const { decks, published, runtime } = setUp();
		await runtime.execute(open);
		await runtime.execute(takeSeat(0));
		await runtime.execute(takeSeat(1));
		const dealt = await runtime.dealNextHand();
		expect(dealt?.table[0]).toMatchObject({ type: "DeckCommitted" });
		expect(decks.revealed).toEqual([]);

		await runtime.execute({ type: "Act", userId: "u0", action: "fold" });
		await runtime.view();

		expect(decks.revealed).toEqual(decks.dealt);
		expect(published.at(-1)?.events.table).toEqual([
			{
				type: "DeckRevealed",
				v: 1,
				handId: decks.dealt[0],
				serverSeed: bytesToHex(FIXED_SEED),
			},
		]);
	});

	it("logs a reveal that failed, and goes on", async () => {
		const error = vi
			.spyOn(Logger.prototype, "error")
			.mockImplementation(() => {});
		const { decks, runtime } = setUp();
		await runtime.execute(open);
		await runtime.execute(takeSeat(0));
		await runtime.execute(takeSeat(1));
		await runtime.dealNextHand();
		vi.spyOn(decks, "reveal").mockResolvedValueOnce("08".repeat(32));

		await runtime.execute({ type: "Act", userId: "u0", action: "fold" });
		await runtime.view();

		expect(error).toHaveBeenCalledWith(
			expect.objectContaining({ msg: "deck not revealed", tableId: "t-1" }),
		);
	});

	it("throws the rule a command breaks, and goes on with the next", async () => {
		const { published, runtime } = setUp();

		const refused = runtime.execute(takeSeat(0));
		const accepted = runtime.execute(open);

		await expect(refused).rejects.toMatchObject({ code: "table.not-open" });
		await expect(accepted).resolves.toMatchObject({
			table: [{ type: "TableOpened" }],
		});
		expect(published).toHaveLength(1);
	});

	it("reloads and decides again once when another writer got there first", async () => {
		const { store, runtime } = setUp();
		await runtime.execute(open);
		// Another instance seats a player behind this runtime's back.
		await store.append("table-t-1", 1, [seatTaken(0)]);

		await expect(runtime.execute(takeSeat(0))).rejects.toMatchObject({
			code: "table.already-seated",
		});
		await expect(runtime.execute(takeSeat(1))).resolves.toEqual({
			table: [seatTaken(1)],
			hand: [],
		});
	});

	it("gives up after a second conflict in a row", async () => {
		const { store, runtime } = setUp();
		await runtime.execute(open);
		const appendToStreams = vi
			.spyOn(store, "appendToStreams")
			.mockRejectedValue(new ConcurrencyError("table-t-1", 1));

		await expect(runtime.execute(takeSeat(0))).rejects.toBeInstanceOf(
			ConcurrencyError,
		);
		expect(appendToStreams).toHaveBeenCalledTimes(2);
	});

	it("reloads after a failed append before the next command", async () => {
		const { store, runtime } = setUp();
		await runtime.execute(open);
		vi.spyOn(store, "appendToStreams").mockRejectedValueOnce(new Error("down"));
		const reads = vi.spyOn(store, "readStream");

		await expect(runtime.execute(takeSeat(0))).rejects.toThrow("down");
		await runtime.execute(takeSeat(0));

		expect(reads).toHaveBeenCalledTimes(1);
	});

	it("deals the next hand a pause after two players are ready, and after each hand", async () => {
		vi.useFakeTimers();
		const { decks, runtime } = setUp();
		await runtime.execute(open);
		await runtime.execute(takeSeat(0));
		await runtime.execute(takeSeat(1));
		expect(runtime.idle).toBe(false);

		await vi.advanceTimersByTimeAsync(HAND_PAUSE_MS - 1);
		expect(decks.dealt).toHaveLength(0);
		await vi.advanceTimersByTimeAsync(1);
		expect(decks.dealt).toHaveLength(1);

		// Heads-up, the button (seat 0) acts first; folding ends the hand.
		await runtime.execute({ type: "Act", userId: "u0", action: "fold" });
		await vi.advanceTimersByTimeAsync(HAND_PAUSE_MS);
		expect(decks.dealt).toHaveLength(2);
	});

	it("deals nothing when the table is not ready, and logs a deal that failed", async () => {
		vi.useFakeTimers();
		const error = vi
			.spyOn(Logger.prototype, "error")
			.mockImplementation(() => {});
		const { decks, runtime } = setUp();
		await runtime.execute(open);
		expect(await runtime.dealNextHand()).toBeNull();

		await runtime.execute(takeSeat(0));
		await runtime.execute(takeSeat(1));
		vi.spyOn(decks, "deal").mockRejectedValueOnce(new Error("no entropy"));
		await vi.advanceTimersByTimeAsync(HAND_PAUSE_MS);

		expect(error).toHaveBeenCalledWith(
			expect.objectContaining({ msg: "next hand not dealt", tableId: "t-1" }),
		);
	});

	describe("the turn timer", () => {
		/** Two players dealt a hand: the button (seat 0) posts the small blind and is to act. */
		async function dealtHeadsUp() {
			vi.useFakeTimers();
			const setup = setUp({ fakeClock: true });
			await setup.runtime.execute(open);
			await setup.runtime.execute(takeSeat(0));
			await setup.runtime.execute(takeSeat(1));
			await setup.runtime.dealNextHand();
			const autoActions = () =>
				setup.published.flatMap(({ events }) =>
					events.hand.flatMap((e) =>
						e.type === "PlayerActed" && e.auto ? [[e.seat, e.action]] : [],
					),
				);
			return { ...setup, autoActions };
		}
		// 20 s a turn, then a 30 s time bank.
		const TURN_AND_BANK_MS = 50_000;

		it("folds a player facing a bet once the turn time and the time bank are spent", async () => {
			const { runtime, published, autoActions } = await dealtHeadsUp();
			expect(runtime.idle).toBe(false);

			await vi.advanceTimersByTimeAsync(TURN_AND_BANK_MS - 1);
			expect(autoActions()).toEqual([]);
			await vi.advanceTimersByTimeAsync(1);

			expect(autoActions()).toEqual([[0, "fold"]]);
			const timedOut = published.find(({ events }) =>
				events.hand.some((e) => e.type === "PlayerActed"),
			)!.events.table;
			expect(timedOut[0]).toEqual({
				type: "TimeBankUsed",
				v: 1,
				seat: 0,
				usedMs: 30_000,
				remainingMs: 0,
			});
		});

		it("checks for a player who can, after a turn that started late in the hand", async () => {
			const { runtime, autoActions } = await dealtHeadsUp();
			await vi.advanceTimersByTimeAsync(5_000);
			await runtime.execute({ type: "Act", userId: "u0", action: "call" });

			// The button's timer is gone: only the big blind's runs, from the call on.
			await vi.advanceTimersByTimeAsync(TURN_AND_BANK_MS - 1);
			expect(autoActions()).toEqual([]);
			await vi.advanceTimersByTimeAsync(1);

			expect(autoActions()).toEqual([[1, "check"]]);
		});

		it("times out each turn once, whatever happens to the old timers", async () => {
			const { runtime, published, autoActions } = await dealtHeadsUp();
			await runtime.execute({ type: "Act", userId: "u0", action: "call" });
			await runtime.execute({ type: "Act", userId: "u1", action: "check" });

			// Nobody acts any more: flop, turn and river are checked down by the timer. The first
			// timeout of each player spends their bank, so later turns last 20 s only.
			await vi.advanceTimersByTimeAsync(TURN_AND_BANK_MS * 10);

			expect(autoActions().filter(([, action]) => action === "check")).toEqual([
				[1, "check"],
				[0, "check"],
				[1, "check"],
				[0, "check"],
				[1, "check"],
				[0, "check"],
			]);
			// The first hand ended with both banks spent (the next hands are dealt after it).
			const settled = published.find(({ events }) =>
				events.table.some((e) => e.type === "HandSettled"),
			)!.state.table;
			expect(settled).toMatchObject({ hand: null, turn: null });
			expect(
				settled.status === "open" && settled.players.map((p) => p.timeBankMs),
			).toEqual([0, 0]);
		});
	});

	describe("the absence timer", () => {
		// The default policy: 120 s to reconnect, then 600 s sitting out.
		async function disconnected() {
			vi.useFakeTimers();
			const setup = setUp({ fakeClock: true });
			await setup.runtime.execute(open);
			await setup.runtime.execute(takeSeat(0));
			await setup.runtime.execute({ type: "Disconnect", userId: "u0" });
			const lastChange = () =>
				setup.published.at(-1)!.events.table.map(({ type }) => type);
			return { ...setup, lastChange };
		}

		it("sits a disconnected player out after the grace, then frees the seat", async () => {
			const { runtime, lastChange } = await disconnected();
			expect(runtime.idle).toBe(false);

			await vi.advanceTimersByTimeAsync(120_000 - 1);
			expect(lastChange()).toEqual(["PlayerDisconnected"]);
			await vi.advanceTimersByTimeAsync(1);
			expect(lastChange()).toEqual(["PlayerStatusChanged", "SitOutStarted"]);

			await vi.advanceTimersByTimeAsync(600_000);
			expect(lastChange()).toEqual(["SeatLeft"]);
			expect(runtime.idle).toBe(true);
		});

		it("sets itself again when it fires a moment before the table's clock says it is due", async () => {
			vi.useFakeTimers();
			const { runtime, published, setNow } = setUp();
			await runtime.execute(open);
			await runtime.execute(takeSeat(0));
			await runtime.execute({ type: "Disconnect", userId: "u0" });

			// The timer is due at 120 s; the clock it is checked against still reads a moment before.
			setNow(119_999);
			await vi.advanceTimersByTimeAsync(120_000);
			expect(runtime.idle).toBe(false);
			setNow(120_000);
			await vi.advanceTimersByTimeAsync(1);

			expect(published.at(-1)!.events.table.map(({ type }) => type)).toEqual([
				"PlayerStatusChanged",
				"SitOutStarted",
			]);
		});

		it("stands down for a player who is back within the grace", async () => {
			const { runtime, lastChange } = await disconnected();
			await vi.advanceTimersByTimeAsync(60_000);
			await runtime.execute({ type: "Reconnect", userId: "u0" });
			expect(runtime.idle).toBe(true);

			await vi.advanceTimersByTimeAsync(600_000);
			expect(lastChange()).toEqual(["PlayerReconnected"]);
		});
	});

	it("is idle with nothing queued and no deal due, and knows when it was last used", async () => {
		const { runtime, setNow } = setUp();
		expect(runtime.idle).toBe(true);
		expect(runtime.lastUsedAt).toBe(0);

		setNow(5_000);
		const opened = runtime.execute(open);
		expect(runtime.idle).toBe(false);
		setNow(6_000);
		await opened;

		expect(runtime.idle).toBe(true);
		expect(runtime.lastUsedAt).toBe(6_000);
	});

	it("finishes queued commands on dispose, then deals no more and takes none", async () => {
		vi.useFakeTimers();
		const { decks, runtime } = setUp();
		await runtime.execute(open);
		await runtime.execute(takeSeat(0));
		const last = runtime.execute(takeSeat(1));

		await runtime.dispose();

		await expect(last).resolves.toEqual({ table: [seatTaken(1)], hand: [] });
		await vi.advanceTimersByTimeAsync(HAND_PAUSE_MS);
		expect(decks.dealt).toEqual([]);
		await expect(runtime.execute(takeSeat(2))).rejects.toThrow(
			"Table t-1 is no longer running here",
		);
	});
});
