import {
	type InMemoryEventLog,
	InMemoryEventStore,
} from "../../../test/support/in-memory-event-store.js";
import { eventStoreContract } from "../../../test/support/event-store-contract.js";
import { type StoredEvent, type Upcasters, upcast } from "./event-store.js";

describe("upcast", () => {
	const upcasters: Upcasters = {
		Renamed: {
			1: (event) => ({ ...event, v: 2, last: "" }),
			2: ({ type, first, last }) => ({
				type,
				v: 3,
				name: `${String(first)} ${String(last)}`,
			}),
		},
		Joined: { 1: ({ userId }) => ({ type: "SeatTaken", v: 1, userId }) },
	};

	it("leaves an event alone when no upcaster matches its type and version", () => {
		const event: StoredEvent = { type: "Renamed", v: 3, name: "Ada" };
		expect(upcast(event, upcasters)).toBe(event);
		expect(upcast({ type: "Other", v: 1 }, upcasters)).toEqual({
			type: "Other",
			v: 1,
		});
	});

	it("chains upcasters until the current version", () => {
		expect(upcast({ type: "Renamed", v: 1, first: "Ada" }, upcasters)).toEqual({
			type: "Renamed",
			v: 3,
			name: "Ada ",
		});
	});

	it("may turn an event into another type", () => {
		expect(upcast({ type: "Joined", v: 1, userId: "u-1" }, upcasters)).toEqual({
			type: "SeatTaken",
			v: 1,
			userId: "u-1",
		});
	});

	it("refuses an upcaster that does not raise the version, which would loop", () => {
		const looping: Upcasters = { Renamed: { 1: (event) => ({ ...event }) } };
		expect(() => upcast({ type: "Renamed", v: 1 }, looping)).toThrow(
			"Upcaster for Renamed v1 must raise the version, got v1",
		);
	});
});

describe("InMemoryEventStore", () => {
	let log: InMemoryEventLog = [];

	eventStoreContract(() => ({
		create: (upcasters) => new InMemoryEventStore(log, upcasters),
		reset: async () => {
			log = [];
		},
	}));
});
