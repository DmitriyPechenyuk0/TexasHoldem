import { Logger } from "@nestjs/common";
import type { CommandBus } from "@nestjs/cqrs";
import type { Clock } from "@/shared/application/clock.js";
import { ExecuteTableCommand } from "@/modules/table/index.js";
import { DomainError } from "@/shared/domain/domain-error.js";
import { IdleTablesScheduler } from "../../idle-tables.scheduler.js";
import { InMemoryLobbyTables, privateTable } from "../in-memory-lobby.js";
import { CloseIdleTablesCommand } from "./close-idle-tables.command.js";
import { CloseIdleTablesHandler } from "./close-idle-tables.handler.js";

const MINUTE = 60_000;

/** The table context's refusal of a table it closed already. */
class TableClosed extends DomainError {
	readonly kind = "conflict";
	readonly code = "table.closed";
}

/** Tables empty from 0, with the clock read from vi's fake timers. */
function setUp(closeTable: (tableId: string) => Promise<unknown>) {
	vi.useFakeTimers({ now: 0 });
	const tables = new InMemoryLobbyTables(
		privateTable({ id: "public", visibility: "public", inviteCode: null }),
		privateTable({ id: "private" }),
		privateTable({
			id: "busy",
			visibility: "public",
			inviteCode: null,
			emptySince: null,
			players: [{ seat: 0, userId: "u-1" }],
		}),
	);
	const closed: string[] = [];
	const clock = { now: () => new Date(Date.now()) } as Clock;
	let handler: CloseIdleTablesHandler;
	const commandBus = {
		execute: vi.fn(async (command: unknown) => {
			if (command instanceof CloseIdleTablesCommand) {
				return handler.execute();
			}
			const { tableId } = command as ExecuteTableCommand;
			await closeTable(tableId);
			closed.push(tableId);
			return undefined;
		}),
	} as unknown as CommandBus;
	handler = new CloseIdleTablesHandler(tables, commandBus, clock);
	const scheduler = new IdleTablesScheduler(commandBus);
	scheduler.onApplicationBootstrap();
	return { tables, closed, scheduler };
}

describe("closing idle tables", () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("closes a public table empty for 15 minutes, a private one after an hour, never one in use", async () => {
		const { closed, scheduler } = setUp(async () => undefined);

		await vi.advanceTimersByTimeAsync(15 * MINUTE);
		expect(closed).toEqual([]);
		await vi.advanceTimersByTimeAsync(MINUTE);
		expect(closed).toEqual(["public"]);

		await vi.advanceTimersByTimeAsync(45 * MINUTE);
		expect(closed).toContain("private");
		expect(closed).not.toContain("busy");
		scheduler.onApplicationShutdown();
	});

	it("marks closed what the table already closed, and tries again later what it would not", async () => {
		vi.spyOn(Logger.prototype, "warn").mockImplementation(() => {});
		const refusals: Record<string, Error> = {
			public: new TableClosed("The table is closed"),
			private: new Error("table busy"),
		};
		const { tables, scheduler } = setUp(async (tableId) => {
			throw refusals[tableId];
		});

		await vi.advanceTimersByTimeAsync(61 * MINUTE);

		const statusOf = (id: string) =>
			tables.rows.find((row) => row.id === id)?.status;
		expect(statusOf("public")).toBe("closed");
		expect(statusOf("private")).toBe("open");
		scheduler.onApplicationShutdown();
	});
});
