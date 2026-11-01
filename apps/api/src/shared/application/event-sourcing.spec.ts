import { InMemoryEventStore } from "../../../test/support/in-memory-event-store.js";
import type { Decider } from "../domain/decider.js";
import { DomainError } from "../domain/domain-error.js";
import { err, ok } from "../domain/result.js";
import { ConcurrencyError } from "./event-store.js";
import { loadDecider, saveDecider } from "./event-sourcing.js";

type CounterEvent = {
	readonly type: "Added";
	readonly v: 1;
	readonly by: number;
};

class NegativeError extends DomainError {
	readonly kind = "rule-violation";
	readonly code = "counter.negative";
}

const counter: Decider<{ add: number }, number, CounterEvent> = {
	decide: ({ add }, total) =>
		total + add < 0
			? err(new NegativeError("Below zero"))
			: ok([{ type: "Added", v: 1, by: add }]),
	evolve: (total, { by }) => total + by,
	initialState: 0,
};

/** One command the way a handler runs it: load → decide → save. */
async function handle(
	store: InMemoryEventStore<CounterEvent>,
	add: number,
): Promise<number> {
	const loaded = await loadDecider(store, counter, "counter-1");
	const decision = counter.decide({ add }, loaded.state);
	if (!decision.ok) throw decision.error;
	return (
		await saveDecider(store, counter, "counter-1", loaded, decision.value)
	).state;
}

describe("loadDecider / saveDecider", () => {
	it("starts an unknown stream from the initial state at version 0", async () => {
		const store = new InMemoryEventStore<CounterEvent>();
		expect(await loadDecider(store, counter, "counter-1")).toEqual({
			state: 0,
			version: 0,
		});
	});

	it("folds the stream, appends at its version and answers the state after", async () => {
		const store = new InMemoryEventStore<CounterEvent>();
		expect(await handle(store, 5)).toBe(5);
		expect(await handle(store, -2)).toBe(3);

		expect(await loadDecider(store, counter, "counter-1")).toEqual({
			state: 3,
			version: 2,
		});
		await expect(handle(store, -4)).rejects.toBeInstanceOf(NegativeError);
	});

	it("passes the metadata on and refuses a save over a stream that moved on", async () => {
		const store = new InMemoryEventStore<CounterEvent>();
		const stale = await loadDecider(store, counter, "counter-1");
		const saved = await saveDecider(
			store,
			counter,
			"counter-1",
			stale,
			[{ type: "Added", v: 1, by: 1 }],
			{ correlationId: "c-1" },
		);

		expect(saved).toEqual({ state: 1, version: 1 });
		expect(store.log[0]?.metadata).toEqual({ correlationId: "c-1" });
		await expect(
			saveDecider(store, counter, "counter-1", stale, [
				{ type: "Added", v: 1, by: 1 },
			]),
		).rejects.toBeInstanceOf(ConcurrencyError);
	});
});
