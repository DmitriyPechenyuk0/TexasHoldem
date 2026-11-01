import type { Ack } from "@holdem/shared";
import type {
	TableClientToServerEvents,
	TableServerToClientEvents,
	TableView,
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

const ok = <T>(ack: Ack<T>): T => {
	if (!ack.ok) throw new Error(`refused: ${ack.error.code}`);
	return ack.data;
};

/** Two api instances on one database and one Redis, as behind a load balancer (POK-85). */
describe("Table absences (e2e)", () => {
	let database: TestDatabase;
	const apps: INestApplication<App>[] = [];
	const urls: string[] = [];
	let store: EventStore<TableStreamEvent>;
	const sockets: TableSocket[] = [];

	beforeAll(async () => {
		database = await createTestDatabase();
		for (let instance = 0; instance < 2; instance++) {
			const app = await createTestApp({
				config: {
					database: { url: database.url },
					trustProxy: "loopback",
				},
			});
			await app.listen(0, "127.0.0.1");
			apps.push(app);
			urls.push(await app.getUrl());
		}
		store = apps[0]!.get(EventStore, { strict: false });
	});

	afterAll(async () => {
		for (const socket of sockets) {
			socket.disconnect();
		}
		await Promise.all(apps.map((app) => app.close()));
		await database?.drop();
	});

	/** A table for one player, so no hand is dealt; `settings` sets its absence policy. */
	const newTable = async (settings: object): Promise<string> => {
		const response = await request(apps[0]!.getHttpServer())
			.post("/api/dev/tables")
			.send(settings)
			.expect(201);
		return (response.body as { tableId: string }).tableId;
	};

	/** The table's events after the first `from`, by type. */
	const typesOf = async (tableId: string, from = 0) =>
		(await store.readStream(`table-${tableId}`))
			.slice(from)
			.map(({ event }) => event.type);

	/** A signed-in user, who opens tabs on either instance. */
	async function user() {
		const { cookie, userId } = await signedInUser(apps[0]!);
		return {
			userId,
			/** Opens a tab on `instance` and joins the table there; answers its socket and snapshot. */
			async tab(tableId: string, instance = 0) {
				const socket = await connectedSocket<TableSocket>(
					urls[instance]!,
					"/table",
					cookie,
				);
				sockets.push(socket);
				const view = ok(
					await socket.emitWithAck("join", {
						tableId: tableId as TableView["tableId"],
						as: "player",
					}),
				);
				return { socket, view };
			},
		};
	}

	async function seated(tableId: string) {
		const alice = await user();
		const first = await alice.tab(tableId);
		ok(
			await first.socket.emitWithAck("take-seat", {
				tableId: tableId as TableView["tableId"],
				seat: 0,
				buyIn: 200,
			}),
		);
		return { alice, first, seatedAt: (await typesOf(tableId)).length };
	}

	it("keeps the seat of a player who comes back within the grace, on another instance", async () => {
		const tableId = await newTable({ reconnectGraceSeconds: 600 });
		const { alice, first, seatedAt } = await seated(tableId);

		first.socket.disconnect();
		await vi.waitFor(async () =>
			expect(await typesOf(tableId, seatedAt)).toEqual(["PlayerDisconnected"]),
		);

		// Back through the other instance: the snapshot already shows them back.
		const back = await alice.tab(tableId, 1);
		expect(back.view.seats).toEqual([
			expect.objectContaining({
				userId: alice.userId,
				status: "waiting-for-big-blind",
				disconnectedAt: null,
			}),
		]);
		expect(await typesOf(tableId, seatedAt)).toEqual([
			"PlayerDisconnected",
			"PlayerReconnected",
		]);
	});

	it("counts a player as connected while any tab, on any instance, follows the table", async () => {
		const tableId = await newTable({ reconnectGraceSeconds: 600 });
		const { alice, first, seatedAt } = await seated(tableId);
		const second = await alice.tab(tableId, 0);
		const third = await alice.tab(tableId, 1);

		first.socket.disconnect();
		second.socket.disconnect();
		// Disconnects are handled on their own: give both instances time to have handled them.
		await new Promise((resolve) => setTimeout(resolve, 500));
		expect(await typesOf(tableId, seatedAt)).toEqual([]);

		// Leaving the table counts as closing its last tab, while the socket stays open.
		ok(
			await third.socket.emitWithAck("leave", {
				tableId: tableId as TableView["tableId"],
			}),
		);
		expect(await typesOf(tableId, seatedAt)).toEqual(["PlayerDisconnected"]);
	});

	it("sits a player out once the grace is over, and frees the seat after the sit-out", async () => {
		const tableId = await newTable({
			reconnectGraceSeconds: 1,
			sitOutSeconds: 1,
		});
		const { first, seatedAt } = await seated(tableId);

		first.socket.disconnect();
		await vi.waitFor(
			async () =>
				expect(await typesOf(tableId, seatedAt)).toEqual([
					"PlayerDisconnected",
					"PlayerStatusChanged",
					"SitOutStarted",
					"SeatLeft",
				]),
			{ timeout: 10_000, interval: 100 },
		);
		const [, satOut] = (await store.readStream(`table-${tableId}`)).slice(
			seatedAt,
		);
		expect(satOut?.event).toMatchObject({ status: "sitting-out" });
		// Signing up through Mailpit, then the grace and the sit-out: more than the default 5 s.
	}, 30_000);
});
