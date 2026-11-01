import {
	type ActiveHand,
	decide,
	deriveHandSeed,
	evolve,
	type HandCommand,
	type HandState,
	initialHandState,
	legalActions,
	type PlayerEvent,
	type PlayerView,
	redactEvent,
	shuffleDeck,
	toPlayerView,
	type Viewer as EngineViewer,
} from "@holdem/engine";
import {
	followsVersions,
	HandEventView,
	HandView,
	TableEventsBatch,
	TableEventView,
	tableNamespace,
	type TableVersions,
	TableView,
} from "./index.js";

/** mulberry32: a small seeded generator, so a failure can be replayed. */
function random(seed: number): (n: number) => number {
	let state = seed >>> 0;
	return (n) => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return Math.floor((((t ^ (t >>> 14)) >>> 0) / 2 ** 32) * n);
	};
}

const userId = (seat: number) =>
	`00000000-0000-4000-8000-${String(seat).padStart(12, "0")}`;

/** One random legal command for the player to act, as the table would send it. */
function nextCommand(
	hand: ActiveHand,
	pick: (n: number) => number,
): HandCommand {
	const seat = hand.toAct!;
	const legal = legalActions(hand, seat);
	if (!legal) {
		return [
			{ type: "ShowCards", seat } as const,
			{ type: "MuckCards", seat } as const,
		][pick(2)]!;
	}
	const passive: HandCommand = {
		type: "Act",
		seat,
		action: legal.canCheck ? "check" : "call",
	};
	// Mostly passive, so that many hands reach the showdown.
	const options: HandCommand[] = [
		passive,
		passive,
		passive,
		{ type: "Act", seat, action: "fold" },
		{ type: "Timeout", seat },
	];
	if (legal.aggression) {
		const { kind, minTo, maxTo } = legal.aggression;
		options.push({
			type: "Act",
			seat,
			action: kind,
			// A min-raise mostly, all-in now and then: all-ins turn every hand up.
			amount: pick(4) === 0 ? maxTo : minTo,
		});
	}
	return options[pick(options.length)]!;
}

/** Plays random hands, handing every view and redacted event to `check` for every viewer. */
function playHands(
	hands: number,
	check: (view: PlayerView, events: readonly PlayerEvent[]) => void,
): void {
	const pick = random(81);
	for (let h = 0; h < hands; h++) {
		const count = 2 + pick(8);
		const seats = Array.from({ length: count }, (_, i) => i);
		const handId = `hand-${h}`;
		let state: HandState = initialHandState;
		const viewers: EngineViewer[] = [...seats, "spectator"];
		const send = (command: HandCommand) => {
			const decision = decide(command, state);
			if (!decision.ok) throw new Error(decision.error.code);
			state = decision.events.reduce(evolve, state);
			for (const viewer of viewers) {
				check(
					toPlayerView(state, viewer),
					decision.events.map((event) => redactEvent(event, viewer)),
				);
			}
		};
		send({
			type: "StartHand",
			config: {
				handId,
				smallBlind: 1,
				bigBlind: 2,
				ante: pick(2),
				buttonSeat: 0,
				smallBlindSeat: count === 2 ? 0 : 1,
				bigBlindSeat: count === 2 ? 1 : 2,
				players: seats.map((seat) => ({
					seat,
					playerId: userId(seat),
					stack: 100 + pick(300),
				})),
				deck: shuffleDeck(deriveHandSeed(new Uint8Array(32).fill(h), handId)),
			},
		});
		while (state.status === "in-progress") {
			send(nextCommand(state, pick));
		}
	}
}

describe("table realtime contracts", () => {
	it("take the engine's views and redacted events as they are, for every viewer", () => {
		let views = 0;
		const types = new Set<string>();
		playHands(60, (view, events) => {
			expect(HandView.parse(view)).toEqual(view);
			views += 1;
			for (const event of events) {
				expect(HandEventView.parse(event)).toEqual(event);
				types.add(event.type);
			}
		});
		expect(HandView.parse({ status: "idle", viewer: "spectator" })).toEqual({
			status: "idle",
			viewer: "spectator",
		});
		expect(views).toBeGreaterThan(1_000);
		// Every kind of hand event came up.
		expect([...types].toSorted()).toEqual(
			HandEventView.options.map((option) => option.shape.type.value).toSorted(),
		);
	});

	it("fit the engine's types without a copy", () => {
		expectTypeOf<PlayerView>().toExtend<HandView>();
		expectTypeOf<PlayerEvent>().toExtend<HandEventView>();
	});

	it("drop the deck and the burn cards, should a raw event slip through", () => {
		const started = HandEventView.parse({
			type: "HandStarted",
			v: 1,
			handId: "h-1",
			smallBlind: 1,
			bigBlind: 2,
			ante: 0,
			buttonSeat: 0,
			smallBlindSeat: 0,
			bigBlindSeat: 1,
			players: [],
			deck: [1, 2, 3],
		});
		expect(started).not.toHaveProperty("deck");
		expect(
			HandEventView.parse({
				type: "StreetDealt",
				v: 1,
				street: "flop",
				burn: 7,
				cards: [1, 2, 3],
			}),
		).not.toHaveProperty("burn");
	});

	it("describe every table event", () => {
		const events = [
			{
				type: "TableOpened",
				v: 1,
				tableId: "0b7c6f1e-58a4-4f6b-9a39-5f0f6a8a1c2d",
				config: {
					smallBlind: 1,
					bigBlind: 2,
					minBuyInBigBlinds: 50,
					maxBuyInBigBlinds: 200,
					maxSeats: 6,
					turnSeconds: 20,
					timeBankSeconds: 30,
					visibility: "public",
				},
			},
			{ type: "SeatTaken", v: 1, seat: 0, userId: userId(0), buyIn: 200 },
			{ type: "PlayerStatusChanged", v: 1, seat: 0, status: "active" },
			{ type: "ChipsAdded", v: 1, seat: 0, amount: 10, reason: "top-up" },
			{ type: "SpectatorJoined", v: 1, userId: userId(9) },
			{ type: "SpectatorLeft", v: 1, userId: userId(9) },
			{
				type: "HandScheduled",
				v: 1,
				handId: "h-1",
				buttonSeat: 0,
				smallBlindSeat: 0,
				bigBlindSeat: 1,
				seats: [0, 1],
			},
			{
				type: "HandSettled",
				v: 1,
				handId: "h-1",
				stacks: [{ seat: 0, stack: 198 }],
			},
			{ type: "SeatLeft", v: 1, seat: 0, userId: userId(0) },
			{
				type: "TurnStarted",
				v: 1,
				handId: "h-1",
				seat: 1,
				startedAt: 1_700_000_000_000,
			},
			{
				type: "TimeBankUsed",
				v: 1,
				seat: 1,
				usedMs: 2_500,
				remainingMs: 27_500,
			},
			{ type: "TableClosed", v: 1 },
		];
		for (const event of events) {
			expect(TableEventView.parse(event)).toEqual(event);
		}
		expect(events.map((e) => e.type)).toHaveLength(
			TableEventView.options.length,
		);
	});

	it("give a snapshot everything the table shows, and nothing it does not", () => {
		const view = {
			tableId: "0b7c6f1e-58a4-4f6b-9a39-5f0f6a8a1c2d",
			versions: { tableVersion: 12, hand: { handId: "h-1", version: 5 } },
			serverTime: "2026-11-01T10:00:05.000Z",
			status: "open",
			settings: {
				smallBlind: 1,
				bigBlind: 2,
				minBuyInBigBlinds: 50,
				maxBuyInBigBlinds: 200,
				maxSeats: 6,
				turnSeconds: 20,
				timeBankSeconds: 30,
				visibility: "private",
			},
			seats: [
				{
					seat: 3,
					userId: userId(3),
					stack: 400,
					status: "sitting-out",
					timeBankMs: 30_000,
				},
			],
			spectatorCount: 2,
			hand: { status: "idle", viewer: "spectator" },
			timer: {
				handId: "h-1",
				seat: 3,
				turnEndsAt: "2026-11-01T10:00:20.000Z",
				timeBankMs: 30_000,
			},
			fairness: { handId: "h-1", serverSeedHash: "ab".repeat(32) },
		};
		expect(TableView.parse(view)).toEqual(view);
		expect(
			TableView.safeParse({
				...view,
				fairness: { handId: "h-1", serverSeedHash: "AB" },
			}).success,
		).toBe(false);
	});

	it("name the commands and server events of the /table namespace", () => {
		expect(tableNamespace.path).toBe("/table");
		expect(Object.keys(tableNamespace.clientToServer)).toEqual([
			"join",
			"leave",
			"take-seat",
			"leave-seat",
			"sit-out",
			"sit-in",
			"act",
			"show-cards",
			"muck-cards",
			"top-up",
			"rebuy",
		]);
		expect(Object.keys(tableNamespace.serverToClient)).toEqual([
			"snapshot",
			"events",
			"timer",
			"problem",
			"session-expired",
		]);
		const { act, join } = tableNamespace.clientToServer;
		const tableId = "0b7c6f1e-58a4-4f6b-9a39-5f0f6a8a1c2d";
		expect(
			act.payload.safeParse({ tableId, action: "raise", amount: 12 }).success,
		).toBe(true);
		expect(act.payload.safeParse({ tableId, action: "limp" }).success).toBe(
			false,
		);
		expect(join.payload.safeParse({ tableId, as: "dealer" }).success).toBe(
			false,
		);
		expect(join.ack).toBe(TableView);
	});
});

describe("followsVersions", () => {
	const known: TableVersions = {
		tableVersion: 10,
		hand: { handId: "h-1", version: 4 },
	};
	const batch = (
		versions: TableVersions,
		table: number,
		hand: readonly { type: string }[],
	) =>
		TableEventsBatch.pick({ versions: true }).parse({ versions }) && {
			versions,
			table: Array.from(
				{ length: table },
				() => ({ type: "SpectatorJoined" }) as never,
			),
			hand: hand as never[],
		};

	it("accepts a batch that continues both streams", () => {
		expect(
			followsVersions(known, batch({ ...known, tableVersion: 11 }, 1, [])),
		).toBe(true);
		expect(
			followsVersions(
				known,
				batch({ tableVersion: 10, hand: { handId: "h-1", version: 6 } }, 0, [
					{ type: "PlayerActed" },
					{ type: "StreetDealt" },
				]),
			),
		).toBe(true);
	});

	it("accepts a batch that starts the next hand's stream", () => {
		expect(
			followsVersions(
				known,
				batch({ tableVersion: 12, hand: { handId: "h-2", version: 3 } }, 2, [
					{ type: "HandStarted" },
					{ type: "BlindPosted" },
					{ type: "BlindPosted" },
				]),
			),
		).toBe(true);
		expect(
			followsVersions(
				{ tableVersion: 3, hand: null },
				batch({ tableVersion: 4, hand: { handId: "h-1", version: 1 } }, 1, [
					{ type: "HandStarted" },
				]),
			),
		).toBe(true);
	});

	it("refuses a batch after a missed one, on either stream", () => {
		expect(
			followsVersions(known, batch({ ...known, tableVersion: 12 }, 1, [])),
		).toBe(false);
		expect(
			followsVersions(
				known,
				batch({ tableVersion: 10, hand: { handId: "h-1", version: 7 } }, 0, [
					{ type: "PlayerActed" },
				]),
			),
		).toBe(false);
		expect(
			followsVersions(
				known,
				batch({ tableVersion: 10, hand: { handId: "h-2", version: 5 } }, 0, [
					{ type: "PlayerActed" },
				]),
			),
		).toBe(false);
		expect(
			followsVersions(
				known,
				batch({ tableVersion: 11, hand: { handId: "h-2", version: 4 } }, 1, []),
			),
		).toBe(false);
		expect(
			followsVersions(
				known,
				batch({ tableVersion: 11, hand: { handId: "h-2", version: 2 } }, 1, [
					{ type: "HandStarted" },
				]),
			),
		).toBe(false);
	});
});
