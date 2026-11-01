import { InMemoryEventStore } from "../../../../../../test/support/in-memory-event-store.js";
import { tableWith } from "../../../../../../test/support/table.js";
import {
	FixedDeckProvider,
	RecordingHandScheduler,
} from "../../../../../../test/support/table-ports.js";
import type { TableStreamEvent } from "../../game-streams.js";
import { StartNextHandCommand } from "./start-next-hand.command.js";
import { StartNextHandHandler } from "./start-next-hand.handler.js";

/** A table with players at `seats`; `stacks` replaces some of their buy-ins of 200. */
async function setUp(seats: number[], stacks: Record<number, number> = {}) {
	const store = new InMemoryEventStore<TableStreamEvent>();
	const history = tableWith(...seats).map((event) =>
		event.type === "SeatTaken"
			? { ...event, buyIn: stacks[event.seat] ?? event.buyIn }
			: event,
	);
	await store.append("table-t-1", 0, history);
	const decks = new FixedDeckProvider();
	const scheduler = new RecordingHandScheduler();
	const handler = new StartNextHandHandler(store, decks, scheduler);
	return {
		store,
		decks,
		scheduler,
		deal: () => handler.execute(new StartNextHandCommand("t-1")),
	};
}

describe("StartNextHandHandler", () => {
	it("deals a hand with a new id and the provider's deck into a stream of its own", async () => {
		const { store, decks, deal } = await setUp([0, 1, 2]);

		const events = await deal();

		const [handId] = decks.dealt;
		expect(handId).toMatch(/^[0-9a-f-]{36}$/);
		expect(events?.table.at(-1)).toMatchObject({
			type: "HandScheduled",
			handId,
		});
		const hand = await store.readStream(`hand-${handId}`);
		expect(hand.map((r) => r.event)).toEqual(events?.hand);
		expect(hand[0]?.event).toMatchObject({ type: "HandStarted", handId });
	});

	it("deals nothing while a hand is running, or with fewer than two players ready", async () => {
		const running = await setUp([0, 1]);
		await running.deal();
		expect(await running.deal()).toBeNull();
		expect(running.decks.dealt).toHaveLength(1);

		const alone = await setUp([0]);
		expect(await alone.deal()).toBeNull();
		expect(alone.decks.dealt).toEqual([]);
	});

	it("schedules the next hand when the deal ends the hand at once", async () => {
		// The button posts the small blind all-in with 1 chip, and nobody is left to bet: the
		// board runs out. With this deck the pot is split, so both players can play on.
		const { scheduler, deal } = await setUp([0, 1], { 0: 1, 1: 3 });

		const events = await deal();

		expect(events?.table.map((e) => e.type)).toEqual([
			"PlayerStatusChanged",
			"PlayerStatusChanged",
			"HandScheduled",
			"HandSettled",
		]);
		expect(events?.table.at(-1)).toMatchObject({
			stacks: [
				{ seat: 0, stack: 1 },
				{ seat: 1, stack: 3 },
			],
		});
		expect(scheduler.scheduled).toEqual(["t-1"]);
	});
});
