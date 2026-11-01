import type { CommandBus } from "@nestjs/cqrs";
import { Clock } from "@/shared/application/clock.js";
import { ExecuteTableCommand } from "@/modules/table/index.js";
import type { LobbyTable } from "../../../domain/lobby-table.js";
import { LobbyTableRepository } from "../../../domain/lobby-table.repository.js";
import { CreateTableCommand } from "./create-table.command.js";
import { CreateTableHandler } from "./create-table.handler.js";

class InMemoryLobbyTables extends LobbyTableRepository {
	readonly rows: LobbyTable[] = [];

	async addUnderLimit(table: LobbyTable, limit: number): Promise<boolean> {
		const open = this.rows.filter(
			(row) => row.creatorId === table.creatorId && row.status === "open",
		);
		if (open.length >= limit) return false;
		this.rows.push(table);
		return true;
	}

	async remove(tableId: string): Promise<void> {
		this.rows.splice(
			this.rows.findIndex((row) => row.id === tableId),
			1,
		);
	}
}

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
		handler: new CreateTableHandler(tables, commandBus, clock),
	};
}

const create = (creatorId = "u-1", turnSeconds?: number) =>
	new CreateTableCommand(
		creatorId,
		"Friday game",
		"low",
		6,
		"private",
		turnSeconds,
	);

describe("CreateTableHandler", () => {
	it("stores the lobby's row, then opens the table with the preset's stakes", async () => {
		const { tables, sent, handler } = setUp();

		const tableId = await handler.execute(create("u-1", 30));

		expect(tables.rows).toEqual([
			{
				id: tableId,
				name: "Friday game",
				presetId: "low",
				maxSeats: 6,
				visibility: "private",
				creatorId: "u-1",
				status: "open",
				createdAt: NOW,
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
						visibility: "private",
					},
				},
				{ userId: "u-1" },
			),
		]);
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
