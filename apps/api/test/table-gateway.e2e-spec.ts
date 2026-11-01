import type { Ack } from "@holdem/shared";
import {
	followsVersions,
	type TableClientToServerEvents,
	type TableEventsBatch,
	type TableServerToClientEvents,
	type TableView,
} from "@holdem/shared/realtime";
import type { INestApplication } from "@nestjs/common";
import type { Socket } from "socket.io-client";
import request from "supertest";
import type { App } from "supertest/types.js";
import type { TableStreamEvent } from "@/modules/table/application/game-streams.js";
import { EventStore } from "@/shared/application/event-store.js";
import { createTestApp } from "./support/create-test-app.js";
import { connectedSocket, signedInUser } from "./support/realtime.js";
import {
	createTestDatabase,
	type TestDatabase,
} from "./support/test-database.js";

type TableSocket = Socket<TableServerToClientEvents, TableClientToServerEvents>;

/** A user at the table: their socket, and everything the server sent it, in order. */
interface Client {
	readonly userId: string;
	readonly socket: TableSocket;
	readonly received: (TableView | TableEventsBatch)[];
	readonly batches: TableEventsBatch[];
	join(): Promise<TableView>;
}

const ok = <T>(ack: Ack<T>): T => {
	if (!ack.ok) throw new Error(`refused: ${ack.error.code}`);
	return ack.data;
};

describe("Table gateway (e2e)", () => {
	let database: TestDatabase;
	let app: INestApplication<App>;
	let baseUrl: string;
	let store: EventStore<TableStreamEvent>;
	const sockets: TableSocket[] = [];

	beforeAll(async () => {
		database = await createTestDatabase();
		app = await createTestApp({
			config: {
				database: { url: database.url },
				trustProxy: "loopback",
				table: { handPauseMs: 50 },
			},
		});
		await app.listen(0, "127.0.0.1");
		baseUrl = await app.getUrl();
		store = app.get(EventStore, { strict: false });
	});

	afterAll(async () => {
		for (const socket of sockets) {
			socket.disconnect();
		}
		await app?.close();
		await database?.drop();
	});

	const newTable = async (): Promise<string> => {
		const response = await request(app.getHttpServer())
			.post("/api/dev/tables")
			.send({})
			.expect(201);
		return (response.body as { tableId: string }).tableId;
	};

	async function client(tableId: string): Promise<Client> {
		const { cookie, userId } = await signedInUser(app);
		const socket = await connectedSocket<TableSocket>(
			baseUrl,
			"/table",
			cookie,
		);
		sockets.push(socket);
		const received: (TableView | TableEventsBatch)[] = [];
		const batches: TableEventsBatch[] = [];
		socket.on("events", (batch) => {
			received.push(batch);
			batches.push(batch);
		});
		return {
			userId,
			socket,
			received,
			batches,
			async join() {
				const view = ok(
					await socket.emitWithAck("join", {
						tableId: tableId as never,
						as: "player",
					}),
				);
				received.push(view);
				return view;
			},
		};
	}

	const tableIdOf = (id: string) => id as TableView["tableId"];

	it("lets two players sit, deals them a hand and plays it to the end, telling each only what they may see", async () => {
		const tableId = await newTable();
		const [alice, bob, carol] = await Promise.all([
			client(tableId),
			client(tableId),
			client(tableId),
		]);
		for (const user of [alice, bob, carol]) {
			await user.join();
		}
		expect((await carol.join()).spectatorCount).toBe(3);

		for (const [seat, user] of [alice, bob].entries()) {
			expect(
				await user.socket.emitWithAck("take-seat", {
					tableId: tableIdOf(tableId),
					seat,
					buyIn: 200,
				}),
			).toEqual({ ok: true, data: {} });
		}
		const settled = (user: Client) =>
			user.batches.some((batch) =>
				batch.table.some((e) => e.type === "HandSettled"),
			);

		// The hand is dealt after the pause; then whoever is to act checks or calls.
		await vi.waitFor(() =>
			expect(alice.batches.some((b) => b.hand[0]?.type === "HandStarted")).toBe(
				true,
			),
		);
		while (!settled(alice)) {
			// Each player looks at most a few times a second, under the command limit.
			await new Promise((resolve) => setTimeout(resolve, 250));
			for (const user of [alice, bob]) {
				const { hand } = await user.join();
				const legal = hand.status === "in-progress" ? hand.legalActions : null;
				if (legal) {
					ok(
						await user.socket.emitWithAck("act", {
							tableId: tableIdOf(tableId),
							action: legal.canCheck ? "check" : "call",
						}),
					);
				} else if (
					hand.status === "in-progress" &&
					hand.street === "showdown" &&
					hand.toAct !== null
				) {
					const mine = hand.players.find((p) => p.playerId === user.userId);
					if (mine?.seat === hand.toAct) {
						ok(
							await user.socket.emitWithAck("muck-cards", {
								tableId: tableIdOf(tableId),
							}),
						);
					}
				}
			}
		}
		await vi.waitFor(() => {
			for (const user of [alice, bob, carol]) expect(settled(user)).toBe(true);
		});

		const settlement = alice.batches
			.flatMap((b) => b.table)
			.find((e) => e.type === "HandSettled");
		expect(
			settlement?.type === "HandSettled" &&
				settlement.stacks.reduce((sum, { stack }) => sum + stack, 0),
		).toBe(400);

		expectNothingHidden(alice.received, 0);
		expectNothingHidden(bob.received, 1);
		expectNothingHidden(carol.received, "spectator");
	}, 30_000);

	it("takes every seat command to the table, and answers the rule one breaks", async () => {
		const tableId = await newTable();
		const alice = await client(tableId);
		await alice.join();
		const id = tableIdOf(tableId);
		const ack = async (
			name:
				| "take-seat"
				| "top-up"
				| "rebuy"
				| "sit-out"
				| "sit-in"
				| "show-cards"
				| "muck-cards"
				| "leave-seat",
			extra: object = {},
		) => {
			const reply = (await alice.socket.emitWithAck(name, {
				tableId: id,
				...extra,
			} as never)) as Ack<object>;
			return reply.ok ? "ok" : reply.error.code;
		};

		expect(await ack("take-seat", { seat: 2, buyIn: 200 })).toBe("ok");
		expect(await ack("top-up", { amount: 50 })).toBe("ok");
		expect(await ack("rebuy", { amount: 200 })).toBe("table.not-busted");
		expect(await ack("sit-out")).toBe("ok");
		expect(await ack("sit-in")).toBe("ok");
		expect(await ack("show-cards")).toBe("table.no-hand");
		expect(await ack("muck-cards")).toBe("table.no-hand");
		expect(await ack("leave-seat")).toBe("ok");

		const events = (await store.readStream(`table-${tableId}`)).map(
			(r) => r.event.type,
		);
		expect(events.slice(-6)).toEqual([
			"SpectatorLeft",
			"SeatTaken",
			"ChipsAdded",
			"PlayerStatusChanged",
			"PlayerStatusChanged",
			"SeatLeft",
		]);
	});

	it("refuses invalid payloads before they reach the table", async () => {
		const tableId = await newTable();
		const alice = await client(tableId);
		await alice.join();
		const before = (await store.readStream(`table-${tableId}`)).length;

		const refused = await alice.socket.emitWithAck("take-seat", {
			tableId: tableIdOf(tableId),
			seat: "first" as never,
			buyIn: -5,
		});

		expect(refused).toMatchObject({
			ok: false,
			error: { status: 400, code: "request.invalid" },
		});
		expect(await store.readStream(`table-${tableId}`)).toHaveLength(before);
	});

	it("answers a table that is not open, and slows down a socket that floods it", async () => {
		const tableId = await newTable();
		const alice = await client(tableId);

		expect(
			await alice.socket.emitWithAck("join", {
				tableId: "0b7c6f1e-58a4-4f6b-9a39-5f0f6a8a1c2d" as never,
				as: "spectator",
			}),
		).toMatchObject({ ok: false, error: { code: "table.not-open" } });

		const acks = await Promise.all(
			Array.from({ length: 15 }, () =>
				alice.socket.emitWithAck("sit-in", { tableId: tableIdOf(tableId) }),
			),
		);
		const codes = acks.map((ack) => (ack.ok ? "ok" : ack.error.code));
		expect(codes).toContain("request.rate-limited");
		expect(
			codes.filter((code) => code === "request.rate-limited").length,
		).toBeGreaterThanOrEqual(5);
	});

	it("lets a client that missed a batch notice it and catch up with a snapshot", async () => {
		const tableId = await newTable();
		const [alice, carol] = await Promise.all([
			client(tableId),
			client(tableId),
		]);
		await alice.join();
		const known = (await carol.join()).versions;
		const seen = carol.batches.length;
		ok(
			await alice.socket.emitWithAck("take-seat", {
				tableId: tableIdOf(tableId),
				seat: 3,
				buyIn: 200,
			}),
		);
		ok(
			await alice.socket.emitWithAck("sit-out", {
				tableId: tableIdOf(tableId),
			}),
		);
		await vi.waitFor(() => expect(carol.batches).toHaveLength(seen + 2));

		// The first batch is lost on the way: the second does not follow what carol has.
		const [first, second] = carol.batches.slice(seen);
		expect(followsVersions(known, first!)).toBe(true);
		expect(followsVersions(known, second!)).toBe(false);
		expect(followsVersions(first!.versions, second!)).toBe(true);

		const snapshot = await carol.join();
		expect(snapshot.versions).toEqual(second!.versions);
		expect(snapshot.seats).toEqual([
			{ seat: 3, userId: alice.userId, stack: 200, status: "sitting-out" },
		]);
	});

	it("stops counting a spectator once their last socket is gone", async () => {
		const tableId = await newTable();
		const [alice, carol] = await Promise.all([
			client(tableId),
			client(tableId),
		]);
		await alice.join();
		expect((await carol.join()).spectatorCount).toBe(2);

		carol.socket.disconnect();

		await vi.waitFor(async () =>
			expect((await alice.join()).spectatorCount).toBe(1),
		);
		ok(
			await alice.socket.emitWithAck("leave", { tableId: tableIdOf(tableId) }),
		);
		const events = await store.readStream(`table-${tableId}`);
		expect(events.at(-1)?.event).toEqual({
			type: "SpectatorLeft",
			v: 1,
			userId: alice.userId,
		});
	});
});

/**
 * Walks everything one viewer received: no deck or burn card anywhere, and no hole cards but
 * their own until a player shows them.
 */
function expectNothingHidden(
	received: readonly (TableView | TableEventsBatch)[],
	viewer: number | "spectator",
): void {
	const walk = (value: unknown): void => {
		if (value && typeof value === "object") {
			expect(value).not.toHaveProperty("deck");
			expect(value).not.toHaveProperty("burn");
			Object.values(value).forEach(walk);
		}
	};
	let holeCardsSeen = 0;
	for (const payload of received) {
		walk(payload);
		if ("settings" in payload) {
			const view = payload.hand;
			if (view.status !== "idle") {
				for (const player of view.players) {
					if (player.seat !== viewer && !player.shown) {
						expect(player.holeCards).toBeNull();
					}
				}
			}
			continue;
		}
		for (const event of payload.hand) {
			if (event.type === "HoleCardsDealt") {
				for (const { seat, cards } of event.hands) {
					if (seat === viewer) {
						expect(cards).not.toBeNull();
						holeCardsSeen += 1;
					} else {
						expect(cards).toBeNull();
					}
				}
			}
		}
	}
	expect(holeCardsSeen).toBe(viewer === "spectator" ? 0 : 1);
}
