import { Logger } from "@nestjs/common";
import type { EventBus } from "@nestjs/cqrs";
import { TableSummaryChanged } from "@/modules/table/index.js";
import type { Clock } from "@/shared/application/clock.js";
import {
	InMemoryLobbyTables,
	privateTable,
} from "../commands/in-memory-lobby.js";
import { LobbyTableChanged } from "./lobby-table-changed.event.js";
import { TableSummaryChangedHandler } from "./table-summary-changed.handler.js";

function setUp() {
	const tables = new InMemoryLobbyTables(
		privateTable({ visibility: "public", inviteCode: null, handsPlayed: 4 }),
	);
	const published: unknown[] = [];
	const handler = new TableSummaryChangedHandler(
		tables,
		{
			publish: (event: unknown) => published.push(event),
		} as unknown as EventBus,
		{ now: () => NOW } as Clock,
	);
	return { tables, published, handler };
}

const NOW = new Date("2026-11-01T10:00:00.000Z");

const seated = [
	{ seat: 0, userId: "u-1" },
	{ seat: 2, userId: "u-2" },
];

describe("TableSummaryChangedHandler", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("keeps who sits at the table and the hands played, and tells the lobby's watchers", async () => {
		const { tables, published, handler } = setUp();

		await handler.handle(new TableSummaryChanged("t-1", "open", seated, 2));

		expect(tables.rows[0]).toMatchObject({
			players: seated,
			handsPlayed: 6,
			status: "open",
		});
		expect(published).toEqual([new LobbyTableChanged(tables.rows[0]!)]);
	});

	it("marks a table empty from the first summary without players, until someone sits", async () => {
		const { tables, handler } = setUp();
		tables.rows[0] = { ...tables.rows[0]!, emptySince: null };

		await handler.handle(new TableSummaryChanged("t-1", "open", [], 0));
		expect(tables.rows[0]?.emptySince).toEqual(NOW);
		await handler.handle(new TableSummaryChanged("t-1", "open", seated, 0));
		expect(tables.rows[0]?.emptySince).toBeNull();
	});

	it("keeps a closed table closed, and ignores tables it does not list", async () => {
		const { tables, published, handler } = setUp();

		await handler.handle(new TableSummaryChanged("t-1", "closed", [], 0));
		await handler.handle(new TableSummaryChanged("t-1", "open", seated, 0));
		await handler.handle(new TableSummaryChanged("dev", "open", seated, 0));

		expect(tables.rows[0]?.status).toBe("closed");
		expect(published).toHaveLength(2);
	});

	it("logs a summary it could not apply, since the next one sets the lobby right", async () => {
		const error = vi
			.spyOn(Logger.prototype, "error")
			.mockImplementation(() => {});
		const { tables, handler } = setUp();
		vi.spyOn(tables, "applySummary").mockRejectedValue(new Error("db down"));

		await handler.handle(new TableSummaryChanged("t-1", "open", seated, 0));

		expect(error).toHaveBeenCalledWith(
			expect.objectContaining({ msg: "lobby not updated", tableId: "t-1" }),
		);
	});
});
