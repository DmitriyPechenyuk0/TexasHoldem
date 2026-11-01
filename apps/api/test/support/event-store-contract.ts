import {
	ConcurrencyError,
	type EventStore,
	type Upcasters,
} from "@/shared/application/event-store.js";

export type ContractEvent =
	| {
			readonly type: "Deposited";
			readonly v: 1;
			readonly amount: number;
			readonly note?: { readonly tags: readonly string[] };
	  }
	| {
			readonly type: "Renamed";
			readonly v: 2;
			readonly first: string;
			readonly last: string;
	  };

export interface EventStoreSubject {
	/** A store over the subject's storage; every store it creates shares that storage. */
	create(upcasters?: Upcasters): EventStore<ContractEvent>;
	/** Empties the storage, positions included. */
	reset(): Promise<void>;
}

const deposited = (amount: number): ContractEvent => ({
	type: "Deposited",
	v: 1,
	amount,
});

/**
 * The rules every `EventStore` keeps. Runs against the Postgres store (e2e) and the in-memory one
 * handler tests use (unit), so the fake cannot drift from the real thing.
 */
export function eventStoreContract(subject: () => EventStoreSubject): void {
	let store: EventStore<ContractEvent>;

	beforeEach(async () => {
		await subject().reset();
		store = subject().create();
	});

	it("appends to a new stream and reads it back in order", async () => {
		const note = { tags: ["a", "b"] };
		const version = await store.append(
			"account-1",
			0,
			[deposited(5), { type: "Deposited", v: 1, amount: 7, note }],
			{ correlationId: "c-1", userId: "u-1" },
		);

		expect(version).toBe(2);
		const recorded = await store.readStream("account-1");
		expect(recorded).toMatchObject([
			{ event: deposited(5), streamId: "account-1", version: 1 },
			{ event: { type: "Deposited", v: 1, amount: 7, note }, version: 2 },
		]);
		for (const { metadata, occurredAt } of recorded) {
			expect(metadata).toEqual({ correlationId: "c-1", userId: "u-1" });
			expect(occurredAt).toBeInstanceOf(Date);
		}
		expect(recorded[1]!.globalPosition).toBeGreaterThan(
			recorded[0]!.globalPosition,
		);
	});

	it("continues a stream from the version it is at", async () => {
		await store.append("account-1", 0, [deposited(1)]);
		expect(await store.append("account-1", 1, [deposited(2)])).toBe(2);
		expect(await store.append("account-1", 2, [deposited(3)])).toBe(3);

		const from2 = await store.readStream("account-1", 2);
		expect(from2.map((r) => [r.version, r.event])).toEqual([
			[2, deposited(2)],
			[3, deposited(3)],
		]);
	});

	it("reads an unknown stream as empty, and an empty append changes nothing", async () => {
		expect(await store.readStream("nobody")).toEqual([]);
		expect(await store.append("nobody", 0, [])).toBe(0);
		expect(await store.readStream("nobody")).toEqual([]);
	});

	it.each([
		["behind the stream", 1],
		["ahead of the stream", 3],
	])(
		"refuses an append whose expected version is %s, and stores none of it",
		async (_, expectedVersion) => {
			await store.append("account-1", 0, [deposited(1), deposited(2)]);

			const append = store.append("account-1", expectedVersion, [
				deposited(3),
				deposited(4),
			]);

			await expect(append).rejects.toBeInstanceOf(ConcurrencyError);
			await expect(append).rejects.toMatchObject({
				code: "event-store.version-conflict",
				params: { streamId: "account-1", expectedVersion },
			});
			expect(await store.readStream("account-1")).toHaveLength(2);
		},
	);

	it("refuses to start a stream that does not exist past version 0", async () => {
		await expect(
			store.append("account-1", 1, [deposited(1)]),
		).rejects.toBeInstanceOf(ConcurrencyError);
	});

	it("lets exactly one of several racing appends through", async () => {
		const outcomes = await Promise.allSettled(
			Array.from({ length: 8 }, (_, i) =>
				store.append("account-1", 0, [deposited(i), deposited(i)]),
			),
		);

		const fulfilled = outcomes.filter((o) => o.status === "fulfilled");
		const rejected = outcomes.filter((o) => o.status === "rejected");
		expect(fulfilled).toHaveLength(1);
		for (const { reason } of rejected) {
			expect(reason).toBeInstanceOf(ConcurrencyError);
		}
		expect(await store.readStream("account-1")).toHaveLength(2);
	});

	it("numbers each stream on its own", async () => {
		await store.append("account-1", 0, [deposited(1)]);
		await store.append("account-2", 0, [deposited(2), deposited(3)]);
		await store.append("account-1", 1, [deposited(4)]);

		expect((await store.readStream("account-1")).map((r) => r.version)).toEqual(
			[1, 2],
		);
		expect((await store.readStream("account-2")).map((r) => r.version)).toEqual(
			[1, 2],
		);
	});

	it("reads every stream in the order of appending, in pages", async () => {
		await store.append("account-1", 0, [deposited(1)]);
		await store.append("account-2", 0, [deposited(2), deposited(3)]);
		await store.append("account-1", 1, [deposited(4)]);

		const all = await store.readAll(0, 100);
		expect(all.map((r) => [r.streamId, r.event])).toEqual([
			["account-1", deposited(1)],
			["account-2", deposited(2)],
			["account-2", deposited(3)],
			["account-1", deposited(4)],
		]);

		const firstPage = await store.readAll(0, 2);
		const secondPage = await store.readAll(firstPage.at(-1)!.globalPosition, 2);
		expect([...firstPage, ...secondPage]).toEqual(all);
		expect(await store.readAll(all.at(-1)!.globalPosition, 100)).toEqual([]);
	});

	it("upcasts old events when they are read, and leaves them stored as they were", async () => {
		// Renamed v1 held the whole name in one field; v2 splits it.
		const renamedV1 = { type: "Renamed", v: 1, name: "Ada Lovelace" };
		await store.append("account-1", 0, [
			renamedV1 as unknown as ContractEvent,
			deposited(1),
		]);

		const upcasters: Upcasters = {
			Renamed: {
				1: ({ name }) => {
					const [first = "", last = ""] = String(name).split(" ");
					return { type: "Renamed", v: 2, first, last };
				},
			},
		};
		const events = (
			await subject().create(upcasters).readStream("account-1")
		).map((r) => r.event);

		expect(events).toEqual([
			{ type: "Renamed", v: 2, first: "Ada", last: "Lovelace" },
			deposited(1),
		]);
		expect((await store.readStream("account-1"))[0]!.event).toEqual(renamedV1);
		expect((await subject().create(upcasters).readAll(0, 1))[0]!.event).toEqual(
			events[0],
		);
	});
}
