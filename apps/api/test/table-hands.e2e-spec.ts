import {
	type HandEvent,
	hexToBytes,
	isCard,
	legalActions,
	verifyDeck,
} from "@holdem/engine";
import { HandFairnessResponse } from "@holdem/shared/contracts/table";
import request from "supertest";
import type { INestApplication } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import {
	ExecuteTableCommand,
	type TableCommandInput,
} from "@/modules/table/application/commands/execute-table-command/execute-table-command.command.js";
import { StartNextHandCommand } from "@/modules/table/application/commands/start-next-hand/start-next-hand.command.js";
import {
	loadGame,
	type TableStreamEvent,
} from "@/modules/table/application/game-streams.js";
import { evolveTable } from "@/modules/table/domain/evolve-table.js";
import type { TableEvent } from "@/modules/table/domain/table-events.js";
import {
	initialTableState,
	type OpenedTable,
	type TableState,
} from "@/modules/table/domain/table-state.js";
import { DomainError } from "@/shared/domain/domain-error.js";
import { EventStore } from "@/shared/application/event-store.js";
import { createTestApp } from "./support/create-test-app.js";
import { tableConfig } from "./support/table.js";
import {
	createTestDatabase,
	type TestDatabase,
} from "./support/test-database.js";

const HANDS = 100;
const SEATS = 6;
/** Replays a failing run: `HOLDEM_TABLE_SEED=<seed> pnpm test:e2e table-hands`. */
// oxlint-disable-next-line no-restricted-properties -- a test knob, not app configuration
const SEED = Number(process.env.HOLDEM_TABLE_SEED ?? 20_261_101);

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

describe("Table hands (e2e)", () => {
	let database: TestDatabase;
	let app: INestApplication;
	let bus: CommandBus;
	let store: EventStore<TableStreamEvent>;

	beforeAll(async () => {
		database = await createTestDatabase();
		app = await createTestApp({
			// Hands are dealt by the test; the scheduler's timers would race it.
			config: {
				database: { url: database.url },
				table: { handPauseMs: 60_000 },
			},
		});
		bus = app.get(CommandBus);
		store = app.get(EventStore, { strict: false });
	});

	afterAll(async () => {
		await app?.close();
		await database?.drop();
	});

	it(`plays ${HANDS} random hands at a ${SEATS}-seat table, conserving every chip (seed ${SEED})`, async () => {
		const pick = random(SEED);
		const tableId = "table-e2e";
		const send = (command: TableCommandInput) =>
			bus.execute(new ExecuteTableCommand(tableId, command));
		/** Seat and status commands a player may send any time; the table may refuse them. */
		const tryToSend = async (command: TableCommandInput) => {
			try {
				await send(command);
			} catch (error) {
				expect(error).toBeInstanceOf(DomainError);
			}
		};

		await send({
			type: "OpenTable",
			tableId,
			config: tableConfig({ maxSeats: SEATS }),
		});
		let newcomers = 0;
		const seatNewPlayer = (seat: number) =>
			send({
				type: "TakeSeat",
				userId: `player-${newcomers++}`,
				verified: true,
				seat,
				buyIn: 100 + pick(301),
			});
		for (let seat = 0; seat < SEATS; seat++) {
			await seatNewPlayer(seat);
		}

		let hands = 0;
		for (let step = 0; hands < HANDS; step++) {
			expect(step).toBeLessThan(HANDS * 200);
			const { state } = await loadGame(store, tableId);
			const table = state.table as OpenedTable;
			const { hand } = state;

			if (!table.hand) {
				// Between hands: busted players rebuy, and empty seats fill up now and then.
				for (const player of table.players) {
					if (player.stack === 0) {
						await send({
							type: "Rebuy",
							userId: player.userId,
							amount: 100 + pick(301),
						});
					}
					if (player.status === "sitting-out" && pick(2) === 0) {
						await send({ type: "SitIn", userId: player.userId });
					}
				}
				for (let seat = 0; seat < SEATS; seat++) {
					if (!table.players.some((p) => p.seat === seat) && pick(2) === 0) {
						await seatNewPlayer(seat);
					}
				}
				const dealt = await bus.execute(new StartNextHandCommand(tableId));
				if (dealt?.table.some((e) => e.type === "HandSettled")) {
					hands += 1;
				}
				continue;
			}

			// Now and then someone sits out or leaves in the middle of the hand.
			if (pick(25) === 0 && table.players.length > 0) {
				const player = table.players[pick(table.players.length)]!;
				await tryToSend({
					type: (["SitOut", "LeaveSeat", "SitIn"] as const)[pick(3)]!,
					userId: player.userId,
				});
				continue;
			}

			expect(hand.status).toBe("in-progress");
			if (hand.status !== "in-progress") break;
			const seat = hand.toAct!;
			const userId = table.players.find((p) => p.seat === seat)!.userId;
			const legal = legalActions(hand, seat);
			let command: TableCommandInput;
			if (!legal) {
				command = [
					{ type: "ShowCards", userId } as const,
					{ type: "MuckCards", userId } as const,
				][pick(2)]!;
			} else {
				const options: TableCommandInput[] = [
					{ type: "Act", userId, action: legal.canCheck ? "check" : "call" },
					{ type: "Act", userId, action: legal.canCheck ? "check" : "call" },
					{ type: "Act", userId, action: "fold" },
				];
				if (legal.aggression) {
					const { kind, minTo, maxTo } = legal.aggression;
					options.push({
						type: "Act",
						userId,
						action: kind,
						amount: minTo + pick(maxTo - minTo + 1),
					});
				}
				command = options[pick(options.length)]!;
			}
			const events = await send(command);
			if (events.table.some((e) => e.type === "HandSettled")) {
				hands += 1;
			}
		}

		await checkTableStream(store, tableId);
		await verifyEveryDeal(app, store, tableId);
	}, 120_000);
});

describe("Dealing hands on a timer (e2e)", () => {
	let database: TestDatabase;
	let app: INestApplication;

	beforeAll(async () => {
		database = await createTestDatabase();
		app = await createTestApp({
			config: { database: { url: database.url }, table: { handPauseMs: 50 } },
		});
	});

	afterAll(async () => {
		await app?.close();
		await database?.drop();
	});

	it("deals once two players are ready, and again a pause after each hand", async () => {
		const bus = app.get(CommandBus);
		const store = app.get(EventStore, {
			strict: false,
		}) as EventStore<TableStreamEvent>;
		const send = (command: TableCommandInput) =>
			bus.execute(new ExecuteTableCommand("timed", command));
		const handIds = async () =>
			(await store.readStream("table-timed")).flatMap(({ event }) =>
				event.type === "HandScheduled" ? [event.handId] : [],
			);
		await send({ type: "OpenTable", tableId: "timed", config: tableConfig() });
		for (const seat of [0, 1]) {
			await send({
				type: "TakeSeat",
				userId: `u${seat}`,
				verified: true,
				seat,
				buyIn: 200,
			});
		}

		await vi.waitFor(async () => expect(await handIds()).toHaveLength(1));
		const { state } = await loadGame(store, "timed");
		const toAct = state.hand.status === "in-progress" ? state.hand.toAct : null;
		await send({ type: "Act", userId: `u${toAct}`, action: "fold" });

		await vi.waitFor(async () => expect(await handIds()).toHaveLength(2));
	});
});

/**
 * Replays the table's stream and checks it event by event: chips are conserved across hands (what
 * players brought, minus what those who left took, is what the seats hold), a hand deals in only
 * active players, nobody dealt in leaves before it settles, and each settlement matches its hand.
 */
async function checkTableStream(
	store: EventStore<TableStreamEvent>,
	tableId: string,
): Promise<void> {
	const recorded = await store.readStream(`table-${tableId}`);
	let state: TableState = initialTableState;
	let brought = 0;
	let taken = 0;
	let settled = 0;
	/** How often the paths worth checking were taken: left or sat out mid-hand, and busted. */
	const seen = { leaving: 0, sitOutInHand: 0, busted: 0 };
	const players = () => (state as OpenedTable).players;

	for (const { event } of recorded as readonly { event: TableEvent }[]) {
		switch (event.type) {
			case "SeatTaken":
				brought += event.buyIn;
				break;
			case "ChipsAdded":
				brought += event.amount;
				break;
			case "SeatLeft": {
				const hand = (state as OpenedTable).hand;
				expect(hand?.seats ?? []).not.toContain(event.seat);
				taken += players().find((p) => p.seat === event.seat)!.stack;
				break;
			}
			case "PlayerStatusChanged": {
				const { hand } = state as OpenedTable;
				const inHand = hand?.seats.includes(event.seat) ?? false;
				if (event.status === "leaving") seen.leaving += 1;
				if (event.status === "sitting-out" && inHand) seen.sitOutInHand += 1;
				if (event.status === "sitting-out" && !hand) seen.busted += 1;
				break;
			}
			case "HandScheduled":
				for (const seat of event.seats) {
					expect(players().find((p) => p.seat === seat)?.status).toBe("active");
				}
				break;
			case "HandSettled": {
				const hand = await store.readStream(`hand-${event.handId}`);
				const events = hand.map((r) => r.event as HandEvent);
				const started = events.find((e) => e.type === "HandStarted");
				const ended = events.at(-1);
				expect(ended?.type).toBe("HandEnded");
				if (started?.type !== "HandStarted" || ended?.type !== "HandEnded")
					break;
				expect(event.stacks).toEqual(ended.stacks);
				const sum = (stacks: readonly { stack: number }[]) =>
					stacks.reduce((total, { stack }) => total + stack, 0);
				expect(sum(ended.stacks)).toBe(sum(started.players));
				settled += 1;
				break;
			}
			default:
				break;
		}
		state = evolveTable(state, event);
		if (event.type === "HandSettled") {
			const held = players().reduce((total, { stack }) => total + stack, 0);
			expect(held + taken).toBe(brought);
		}
	}
	expect(settled).toBeGreaterThanOrEqual(HANDS);
	expect(seen).toEqual({
		leaving: expect.any(Number),
		sitOutInHand: expect.any(Number),
		busted: expect.any(Number),
	});
	for (const count of Object.values(seen)) {
		expect(count).toBeGreaterThan(0);
	}
}

/**
 * Checks every hand the way any player can (ADR-008): the seed revealed after the hand matches the
 * commitment published before its deal, and rebuilds a deck that starts with the dealt cards.
 */
async function verifyEveryDeal(
	app: INestApplication,
	store: EventStore<TableStreamEvent>,
	tableId: string,
): Promise<void> {
	const recorded = await store.readStream(`table-${tableId}`);
	const commitments = new Map(
		recorded.flatMap(({ event }) =>
			event.type === "DeckCommitted"
				? [[event.handId, event.commitment] as const]
				: [],
		),
	);
	const settled = recorded.flatMap(({ event }) =>
		event.type === "HandSettled" ? [event.handId] : [],
	);
	expect(settled.length).toBeGreaterThanOrEqual(HANDS);
	// The last hand's seed is revealed right after the command that ended it.
	await vi.waitFor(async () => {
		await request(app.getHttpServer())
			.get(`/api/hands/${settled.at(-1)}/fairness`)
			.expect(200);
	});
	for (const handId of settled) {
		const response = await request(app.getHttpServer())
			.get(`/api/hands/${handId}/fairness`)
			.expect(200);
		const fairness = HandFairnessResponse.parse(response.body);
		expect(fairness.commitment).toBe(commitments.get(handId));
		// Contracts carry cards as numbers; the engine brands them.
		const dealtCards = fairness.dealtCards.filter(isCard);
		expect(dealtCards).toHaveLength(fairness.dealtCards.length);
		const verification = verifyDeck({
			serverSeed: hexToBytes(fairness.serverSeed),
			commitment: fairness.commitment,
			handId,
			clientSeeds: fairness.clientSeeds,
			dealtCards,
		});
		expect(verification.ok).toBe(true);
		expect(fairness.dealtCards.length).toBeGreaterThanOrEqual(4);
	}

	const unknown = await request(app.getHttpServer())
		.get("/api/hands/0b7c6f1e-58a4-4f6b-9a39-5f0f6a8a1c2d/fairness")
		.expect(404);
	expect(unknown.body).toMatchObject({ code: "table.hand-not-found" });
	await request(app.getHttpServer()).get("/api/hands/h-1/fairness").expect(400);
}
