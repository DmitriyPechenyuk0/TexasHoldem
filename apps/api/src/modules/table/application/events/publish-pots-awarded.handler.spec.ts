import {
	type HandEvent,
	type HandState,
	initialHandState,
} from "@holdem/engine";
import { tableWith } from "../../../../../test/support/table.js";
import type { IntegrationEventBus } from "@/shared/application/integration-events.js";
import { replayTable } from "../../domain/evolve-table.js";
import { PotsAwarded } from "./pots-awarded.event.js";
import { PublishPotsAwardedHandler } from "./publish-pots-awarded.handler.js";
import { TableChanged } from "./table-changed.event.js";

const ended = { status: "ended", handId: "h-1" } as unknown as HandState;

function setUp() {
	const published: unknown[] = [];
	const handler = new PublishPotsAwardedHandler({
		publish: (...events: unknown[]) => published.push(...events),
	} as unknown as IntegrationEventBus);
	const change = (hand: HandState, events: HandEvent[]) =>
		handler.handle(
			new TableChanged(
				"table-1",
				{ tableVersion: 3, hand: null },
				{ table: [], hand: events },
				{ table: replayTable(tableWith(0, 3)), hand },
			),
		);
	return { published, change };
}

const potAwarded = (
	pot: number,
	...winners: { seat: number; amount: number; category?: string }[]
) =>
	({
		type: "PotAwarded",
		v: 1,
		pot,
		winners: winners.map(({ seat, amount, category }) => ({
			seat,
			amount,
			...(category ? { hand: { category, cards: [], ranks: [] } } : {}),
		})),
	}) as unknown as HandEvent;

describe("PublishPotsAwardedHandler", () => {
	it("tells who won each pot, by user, with the hand when it was shown", () => {
		const { published, change } = setUp();

		change(ended, [
			potAwarded(0, { seat: 3, amount: 120, category: "flush" }),
			potAwarded(
				1,
				{ seat: 0, amount: 30 },
				{ seat: 3, amount: 30 },
				{ seat: 7, amount: 30 },
			),
		]);

		expect(published).toEqual([
			new PotsAwarded("table-1", "h-1", [
				{ pot: 0, userId: "u3", amount: 120, category: "flush" },
				{ pot: 1, userId: "u0", amount: 30, category: null },
				{ pot: 1, userId: "u3", amount: 30, category: null },
			]),
		]);
	});

	it("stays quiet when no pot was awarded", () => {
		const { published, change } = setUp();

		change(ended, [{ type: "HandEnded", v: 1, stacks: [] } as HandEvent]);
		change(initialHandState, []);

		expect(published).toEqual([]);
	});
});
