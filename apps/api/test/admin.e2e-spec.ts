import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Ack } from "@holdem/shared";
import {
	AdminTablesResponse,
	AdminUsersResponse,
	AuditResponse,
} from "@holdem/shared/contracts/admin";
import type {
	TableClientToServerEvents,
	TableEventsBatch,
	TableServerToClientEvents,
	TableView,
} from "@holdem/shared/realtime";
import type { INestApplication } from "@nestjs/common";
import type { Socket } from "socket.io-client";
import request from "supertest";
import type { App } from "supertest/types.js";
import { createTestApp } from "./support/create-test-app.js";
import { WEB_ORIGIN } from "./support/identity.js";
import { connectedSocket, signedInUser } from "./support/realtime.js";
import {
	createTestDatabase,
	type TestDatabase,
} from "./support/test-database.js";

type TableSocket = Socket<TableServerToClientEvents, TableClientToServerEvents>;

const run = promisify(execFile);

/** The limited admin (POK-114). */
describe("Admin (e2e)", () => {
	let database: TestDatabase;
	let app: INestApplication<App>;
	let baseUrl: string;
	const sockets: Socket[] = [];

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
	});

	afterAll(async () => {
		for (const socket of sockets) socket.disconnect();
		await app?.close();
		await database?.drop();
	});

	let lastAddress = 0;
	const user = async () => {
		const { cookie, userId, email } = await signedInUser(app);
		const ip = `198.23.0.${++lastAddress}`;
		const send = <T extends request.Test>(test: T) =>
			test
				.set("Cookie", cookie)
				.set("Origin", WEB_ORIGIN)
				.set("X-Forwarded-For", ip);
		return {
			cookie,
			userId,
			email,
			get: (path: string) => send(request(app.getHttpServer()).get(path)),
			post: (path: string, body: object = {}) =>
				send(request(app.getHttpServer()).post(path)).send(body),
		};
	};

	/** Runs the command-line script that grants roles, against the test database. */
	const setRole = (account: string, role: string) =>
		run(process.execPath, ["scripts/user-role.mjs", account, role], {
			// oxlint-disable-next-line no-restricted-properties -- the script needs the PATH and such
			env: { ...process.env, DATABASE_URL: database.url },
		});

	const admin = async () => {
		const account = await user();
		await setRole(account.email, "admin");
		return account;
	};

	const ROUTES: readonly ["get" | "post", string][] = [
		["get", "/api/admin/tables"],
		["post", "/api/admin/tables/0b7c6f1e-58a4-4f6b-9a39-5f0f6a8a1c2d/close"],
		["get", "/api/admin/users?q=alice"],
		[
			"post",
			"/api/admin/users/0b7c6f1e-58a4-4f6b-9a39-5f0f6a8a1c2d/revoke-sessions",
		],
		["get", "/api/admin/audit"],
	];

	it("refuses every admin route to players (403) and to strangers (401)", async () => {
		const player = await user();

		for (const [method, path] of ROUTES) {
			const refused = await player[method](path).expect(403);
			expect(refused.body).toMatchObject({ code: "auth.admin-only" });
			await request(app.getHttpServer())
				[method](path)
				.set("Origin", WEB_ORIGIN)
				.expect(401);
		}
		expect((await player.get("/api/me").expect(200)).body).toMatchObject({
			role: "user",
		});
	});

	it("grants the role from the command line only, and takes it back there", async () => {
		const boss = await admin();
		expect((await boss.get("/api/me").expect(200)).body).toMatchObject({
			role: "admin",
		});
		await boss.get("/api/admin/tables").expect(200);

		await setRole(boss.email, "user");
		await boss.get("/api/admin/tables").expect(403);
		await expect(setRole("nobody@example.test", "admin")).rejects.toMatchObject(
			{ code: 1 },
		);
		await expect(setRole(boss.email, "root")).rejects.toMatchObject({
			code: 2,
		});
	});

	it("closes a table mid-hand, giving every chip back, and audits it", async () => {
		const boss = await admin();
		const [alice, bob] = [await user(), await user()];
		const tableId = (
			(
				await alice
					.post("/api/lobby/tables", {
						name: "Doomed game",
						presetId: "micro",
						maxSeats: 6,
						visibility: "private",
					})
					.expect(201)
			).body as { tableId: string }
		).tableId;
		const batches: TableEventsBatch[] = [];
		for (const [seat, player] of [alice, bob].entries()) {
			if (player === bob) {
				const { inviteCode } = (
					await alice.get("/api/lobby/my-tables").expect(200)
				).body[0] as { inviteCode: string };
				await bob.post(`/api/lobby/invites/${inviteCode}/redeem`).expect(200);
			}
			const socket = await connectedSocket<TableSocket>(
				baseUrl,
				"/table",
				player.cookie,
			);
			sockets.push(socket);
			if (player === alice) socket.on("events", (batch) => batches.push(batch));
			const id = tableId as TableView["tableId"];
			await socket.emitWithAck("join", { tableId: id, as: "player" });
			const taken = (await socket.emitWithAck("take-seat", {
				tableId: id,
				seat,
				buyIn: 100,
			})) as Ack<object>;
			expect(taken.ok).toBe(true);
		}
		await vi.waitFor(() =>
			expect(
				batches.some((batch) => batch.hand[0]?.type === "HandStarted"),
			).toBe(true),
		);
		const listed = AdminTablesResponse.parse(
			(await boss.get("/api/admin/tables").expect(200)).body,
		);
		expect(listed.find((table) => table.tableId === tableId)).toMatchObject({
			visibility: "private",
			creator: expect.objectContaining({ userId: alice.userId }),
			seats: [
				expect.objectContaining({ seat: 0, userId: alice.userId }),
				expect.objectContaining({ seat: 1, userId: bob.userId }),
			],
		});

		await boss.post(`/api/admin/tables/${tableId}/close`).expect(204);

		await vi.waitFor(() => {
			const events = batches.flatMap((batch) => [
				...batch.hand,
				...batch.table,
			]);
			expect(events.map(({ type }) => type)).toEqual(
				expect.arrayContaining(["HandCancelled", "HandSettled", "TableClosed"]),
			);
			const cancelled = events.find(({ type }) => type === "HandCancelled");
			expect(cancelled).toMatchObject({
				stacks: [
					{ seat: 0, stack: 100 },
					{ seat: 1, stack: 100 },
				],
			});
		});
		await vi.waitFor(async () => {
			const tables = AdminTablesResponse.parse(
				(await boss.get("/api/admin/tables").expect(200)).body,
			);
			expect(tables.map((table) => table.tableId)).not.toContain(tableId);
		});
		const handId = batches.find(
			(batch) => batch.hand[0]?.type === "HandStarted",
		)!.versions.hand!.handId;
		await vi.waitFor(() =>
			request(app.getHttpServer())
				.get(`/api/hands/${handId}/fairness`)
				.expect(200),
		);
		const again = await boss.post(`/api/admin/tables/${tableId}/close`);
		expect(again.body).toMatchObject({ code: "table.closed" });

		const audit = AuditResponse.parse(
			(await boss.get("/api/admin/audit").expect(200)).body,
		);
		expect(audit).toContainEqual(
			expect.objectContaining({
				adminId: boss.userId,
				action: "force-close-table",
				target: tableId,
			}),
		);
		expect(audit).toContainEqual(
			expect.objectContaining({
				adminId: null,
				action: "set-role",
				target: boss.userId,
				details: { role: "admin", by: "command line" },
			}),
		);
	}, 20_000);

	it("looks a user up with their tables, and signs them out everywhere", async () => {
		const boss = await admin();
		const carol = await user();

		const found = AdminUsersResponse.parse(
			(
				await boss
					.get(
						`/api/admin/users?q=${encodeURIComponent(carol.email.toUpperCase())}`,
					)
					.expect(200)
			).body,
		);
		expect(found).toEqual([
			expect.objectContaining({
				userId: carol.userId,
				email: carol.email,
				emailVerified: true,
				role: "user",
				nickname: expect.any(String),
				tables: [],
			}),
		]);

		const revoked = await boss
			.post(`/api/admin/users/${carol.userId}/revoke-sessions`)
			.expect(200);
		expect(revoked.body.revoked).toBeGreaterThanOrEqual(1);
		await carol.get("/api/me").expect(401);
		const audit = AuditResponse.parse(
			(await boss.get("/api/admin/audit").expect(200)).body,
		);
		expect(audit[0]).toMatchObject({
			action: "revoke-sessions",
			target: carol.userId,
			details: { revoked: revoked.body.revoked },
		});
	});
});
