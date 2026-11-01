import type { CommandBus } from "@nestjs/cqrs";
import type { Clock } from "@/shared/application/clock.js";
import { ExecuteTableCommand } from "@/modules/table/index.js";
import {
	InMemoryLobbyTables,
	PlainPasswordHasher,
} from "../in-memory-lobby.js";
import { CreateTableCommand } from "./create-table.command.js";
import { CreateTableHandler } from "./create-table.handler.js";

const NOW = new Date("2026-11-01T10:00:00.000Z");

function setUp(openTable: () => Promise<unknown> = async () => undefined) {
	const tables = new InMemoryLobbyTables();
	const sent: ExecuteTableCommand[] = [];
	const commandBus = {
		execute: vi.fn(async (command: ExecuteTableCommand) => {
			sent.push(command);
			return openTable();
		}),
	} as unknown as CommandBus;
	const clock = { now: () => NOW } as Clock;
	return {
		tables,
		sent,
		handler: new CreateTableHandler(
			tables,
			commandBus,
			clock,
			new PlainPasswordHasher(),
		),
	};
}

const create = (
	creatorId = "u-1",
	{
		turnSeconds,
		visibility = "public",
		password,
	}: {
		turnSeconds?: number;
		visibility?: "public" | "private";
		password?: string;
	} = {},
) =>
	new CreateTableCommand(
		creatorId,
		"Friday game",
		"low",
		6,
		visibility,
		turnSeconds,
		password,
	);

describe("CreateTableHandler", () => {
	it("stores the lobby's row, then opens the table with the preset's stakes", async () => {
		const { tables, sent, handler } = setUp();

		const { tableId, inviteCode } = await handler.execute(
			create("u-1", { turnSeconds: 30 }),
		);

		expect(inviteCode).toBeNull();
		expect(tables.rows).toEqual([
			{
				id: tableId,
				name: "Friday game",
				presetId: "low",
				maxSeats: 6,
				visibility: "public",
				creatorId: "u-1",
				status: "open",
				createdAt: NOW,
				inviteCode: null,
				passwordHash: null,
			},
		]);
		expect(sent).toEqual([
			new ExecuteTableCommand(
				tableId,
				{
					type: "OpenTable",
					tableId,
					config: {
						smallBlind: 5,
						bigBlind: 10,
						minBuyInBigBlinds: 40,
						maxBuyInBigBlinds: 100,
						maxSeats: 6,
						turnSeconds: 30,
						timeBankSeconds: 30,
						reconnectGraceSeconds: 120,
						disconnectedTurnSeconds: 5,
						sitOutSeconds: 600,
						sitOutHands: 3,
						visibility: "public",
					},
				},
				{ userId: "u-1" },
			),
		]);
	});

	it("gives a private table an invite code, and stores its password hashed", async () => {
		const { tables, sent, handler } = setUp();

		const { inviteCode } = await handler.execute(
			create("u-1", { visibility: "private", password: "secret" }),
		);

		expect(inviteCode).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/);
		expect(tables.rows[0]).toMatchObject({
			inviteCode,
			passwordHash: "plain:secret",
		});
		expect(sent[0]?.command).toMatchObject({
			config: { visibility: "private" },
		});
	});

	it("draws another invite code when the first is taken", async () => {
		const { tables, handler } = setUp();
		const first = await handler.execute(
			create("u-1", { visibility: "private" }),
		);
		const addUnderLimit = vi.spyOn(tables, "addUnderLimit");
		addUnderLimit.mockResolvedValueOnce("code-taken");

		const second = await handler.execute(
			create("u-2", { visibility: "private" }),
		);

		expect(addUnderLimit).toHaveBeenCalledTimes(2);
		expect(second.inviteCode).not.toBe(first.inviteCode);
		addUnderLimit.mockResolvedValue("code-taken");
		await expect(
			handler.execute(create("u-3", { visibility: "private" })),
		).rejects.toThrow("No free invite code");
	});

	it("gives each turn 20 s unless told otherwise", async () => {
		const { sent, handler } = setUp();

		await handler.execute(create());

		expect(sent[0]?.command).toMatchObject({ config: { turnSeconds: 20 } });
	});

	it("refuses a fourth open table of one player, and opens none", async () => {
		const { sent, handler } = setUp();
		for (let made = 0; made < 3; made++) {
			await handler.execute(create());
		}

		await expect(handler.execute(create())).rejects.toMatchObject({
			code: "lobby.too-many-tables",
			params: { max: 3 },
		});
		expect(sent).toHaveLength(3);
		// Another player still may.
		await expect(handler.execute(create("u-2"))).resolves.toBeDefined();
	});

	it("refuses broken settings before storing anything", async () => {
		const { tables, handler } = setUp();

		await expect(
			handler.execute(new CreateTableCommand("u-1", " ", "low", 6, "public")),
		).rejects.toMatchObject({ code: "lobby.invalid-name" });
		await expect(
			handler.execute(create("u-1", { password: "secret" })),
		).rejects.toMatchObject({ code: "lobby.password-needs-private" });
		expect(tables.rows).toEqual([]);
	});

	it("leaves no row behind when the table could not be opened", async () => {
		const { tables, handler } = setUp(async () => {
			throw new Error("table refused");
		});

		await expect(handler.execute(create())).rejects.toThrow("table refused");
		expect(tables.rows).toEqual([]);
	});
});
