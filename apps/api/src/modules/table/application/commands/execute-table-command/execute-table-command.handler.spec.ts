import { InMemoryEventStore } from "../../../../../../test/support/in-memory-event-store.js";
import {
	seatTaken,
	tableConfig,
} from "../../../../../../test/support/table.js";
import {
	FixedDeckProvider,
	RecordingHandScheduler,
} from "../../../../../../test/support/table-ports.js";
import { ConcurrencyError } from "@/shared/application/event-store.js";
import type { TableStreamEvent } from "../../game-streams.js";
import { StartNextHandCommand } from "../start-next-hand/start-next-hand.command.js";
import { StartNextHandHandler } from "../start-next-hand/start-next-hand.handler.js";
import {
	ExecuteTableCommand,
	type TableCommandInput,
} from "./execute-table-command.command.js";
import { ExecuteTableCommandHandler } from "./execute-table-command.handler.js";

function setUp() {
	const store = new InMemoryEventStore<TableStreamEvent>();
	const scheduler = new RecordingHandScheduler();
	const handler = new ExecuteTableCommandHandler(store, scheduler);
	const send = (command: TableCommandInput) =>
		handler.execute(
			new ExecuteTableCommand("t-1", command, { userId: "admin" }),
		);
	const deal = () =>
		new StartNextHandHandler(store, new FixedDeckProvider(), scheduler).execute(
			new StartNextHandCommand("t-1"),
		);
	return { store, scheduler, send, deal };
}

const takeSeat = (seat: number): TableCommandInput => ({
	type: "TakeSeat",
	userId: `u${seat}`,
	verified: true,
	seat,
	buyIn: 200,
});

describe("ExecuteTableCommandHandler", () => {
	it("appends the decision to the table's stream with the metadata, and answers it", async () => {
		const { store, send } = setUp();
		await send({ type: "OpenTable", tableId: "t-1", config: tableConfig() });

		const events = await send(takeSeat(0));

		expect(events).toEqual({ table: [seatTaken(0)], hand: [] });
		const stream = await store.readStream("table-t-1");
		expect(stream.map((r) => [r.version, r.event.type])).toEqual([
			[1, "TableOpened"],
			[2, "SeatTaken"],
		]);
		expect(stream[1]?.metadata).toEqual({ userId: "admin" });
	});

	it("throws the rule a command breaks, and stores nothing", async () => {
		const { store, send } = setUp();
		await expect(send(takeSeat(0))).rejects.toMatchObject({
			code: "table.not-open",
		});
		expect(store.log).toEqual([]);
	});

	it("schedules the next hand once two players are ready", async () => {
		const { scheduler, send } = setUp();
		await send({ type: "OpenTable", tableId: "t-1", config: tableConfig() });
		await send(takeSeat(0));
		expect(scheduler.scheduled).toEqual([]);

		await send(takeSeat(1));
		expect(scheduler.scheduled).toEqual(["t-1"]);
	});

	it("sends hand commands to the hand's stream, and settles an ended hand into the table's", async () => {
		const { store, scheduler, send, deal } = setUp();
		await send({ type: "OpenTable", tableId: "t-1", config: tableConfig() });
		await send(takeSeat(0));
		await send(takeSeat(1));
		const handId = (await deal())?.table.find(
			(e) => e.type === "HandScheduled",
		)?.handId;
		scheduler.scheduled.length = 0;

		// Heads-up, the button (seat 0) posts the small blind and acts first.
		const events = await send({ type: "Act", userId: "u0", action: "fold" });

		expect(events.table.map((e) => e.type)).toEqual(["HandSettled"]);
		const hand = await store.readStream(`hand-${handId}`);
		expect(hand.at(0)?.event.type).toBe("HandStarted");
		expect(hand.at(-1)?.event.type).toBe("HandEnded");
		expect(scheduler.scheduled).toEqual(["t-1"]);
	});

	it("passes a lost race on as ConcurrencyError", async () => {
		const { store, send } = setUp();
		await send({ type: "OpenTable", tableId: "t-1", config: tableConfig() });
		const appendToStreams = store.appendToStreams.bind(store);
		vi.spyOn(store, "appendToStreams").mockImplementationOnce(
			async (appends, metadata) => {
				await store.append("table-t-1", 1, [seatTaken(5)]);
				return appendToStreams(appends, metadata);
			},
		);

		await expect(send(takeSeat(0))).rejects.toBeInstanceOf(ConcurrencyError);
	});
});
