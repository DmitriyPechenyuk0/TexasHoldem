import { Logger } from "@nestjs/common";
import type { EventBus, IEvent } from "@nestjs/cqrs";
import { z } from "zod";
import { IntegrationEvent } from "../../application/integration-events.js";
import type { Database } from "../database/database.js";
import { inTransaction } from "../database/transaction.js";
import type { Redis, RedisConnections } from "../redis/index.js";
import {
	INTEGRATION_EVENTS_CHANNEL,
	RedisIntegrationEventBus,
} from "./redis-integration-event-bus.js";

@IntegrationEvent({
	name: "test.noted",
	version: 1,
	schema: z.object({ note: z.string() }),
	broadcast: false,
})
class Noted implements IEvent {
	constructor(readonly note: string) {}
}

@IntegrationEvent({
	name: "test.pinged",
	version: 2,
	schema: z.object({ id: z.string() }),
	broadcast: true,
})
class Pinged implements IEvent {
	constructor(readonly id: string) {}
}

class Unmarked implements IEvent {}

function setUp(publishFails = false) {
	const published: IEvent[] = [];
	const eventBus = {
		publish: (event: IEvent) => published.push(event),
	} as unknown as EventBus;
	const redisPublish = vi.fn(async () =>
		publishFails ? Promise.reject(new Error("The client is closed")) : 1,
	);
	let listener: (message: string) => void = () => undefined;
	const subscriber = {
		on: vi.fn(),
		subscribe: vi.fn(async (_: string, received: typeof listener) => {
			listener = received;
		}),
	};
	const bus = new RedisIntegrationEventBus(
		eventBus,
		{ publish: redisPublish } as unknown as Redis,
		{ open: () => subscriber } as unknown as RedisConnections,
	);
	return {
		bus,
		published,
		redisPublish,
		subscriber,
		receive: (message: unknown) => listener(JSON.stringify(message)),
	};
}

const database = {
	transaction: (work: (tx: unknown) => unknown) => work("tx"),
} as unknown as Database;

describe("RedisIntegrationEventBus", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("publishes on this instance, and broadcasts only the events marked so", async () => {
		const { bus, published, redisPublish } = setUp();

		bus.publish(new Noted("hi"), new Pinged("p-1"));

		expect(published).toEqual([new Noted("hi"), new Pinged("p-1")]);
		expect(redisPublish).toHaveBeenCalledTimes(1);
		const [channel, message] = redisPublish.mock.calls[0] as unknown as [
			string,
			string,
		];
		expect(channel).toBe(INTEGRATION_EVENTS_CHANNEL);
		expect(JSON.parse(message)).toEqual({
			from: expect.any(String),
			name: "test.pinged",
			v: 2,
			data: { id: "p-1" },
		});
	});

	it("waits for the transaction to commit, and publishes nothing when it rolls back", async () => {
		const { bus, published } = setUp();

		await inTransaction(database, async () => {
			bus.publish(new Noted("committed"));
			expect(published).toEqual([]);
		});
		await expect(
			inTransaction(database, async () => {
				bus.publish(new Noted("rolled back"));
				throw new Error("rolled back");
			}),
		).rejects.toThrow();

		expect(published).toEqual([new Noted("committed")]);
	});

	it("refuses an event that is not an integration event", () => {
		expect(() => setUp().bus.publish(new Unmarked())).toThrow(
			"Unmarked is not an @IntegrationEvent",
		);
	});

	it("publishes another instance's broadcast here, as an instance of its class", async () => {
		const { bus, published, subscriber, receive } = setUp();
		await bus.onModuleInit();
		expect(subscriber.subscribe).toHaveBeenCalledWith(
			INTEGRATION_EVENTS_CHANNEL,
			expect.any(Function),
		);

		receive({ from: "other", name: "test.pinged", v: 2, data: { id: "p-9" } });

		expect(published).toEqual([new Pinged("p-9")]);
		expect(published[0]).toBeInstanceOf(Pinged);
	});

	it("ignores its own broadcasts, and drops unknown versions, names and data", async () => {
		const warn = vi
			.spyOn(Logger.prototype, "warn")
			.mockImplementation(() => {});
		const { bus, published, redisPublish, receive } = setUp();
		await bus.onModuleInit();
		bus.publish(new Pinged("mine"));
		const own = JSON.parse(
			(redisPublish.mock.calls[0] as unknown as [string, string])[1],
		) as unknown;
		published.length = 0;

		receive(own);
		receive({ from: "other", name: "test.pinged", v: 3, data: { id: "x" } });
		receive({ from: "other", name: "test.unknown", v: 1, data: {} });
		receive({ from: "other", name: "test.pinged", v: 2, data: { id: 7 } });
		receive("not an envelope");

		expect(published).toEqual([]);
		expect(warn).toHaveBeenCalledTimes(4);
	});

	it("keeps events on this instance while Redis fails, and warns once", async () => {
		const warn = vi
			.spyOn(Logger.prototype, "warn")
			.mockImplementation(() => {});
		const { bus, published } = setUp(true);

		bus.publish(new Pinged("a"));
		bus.publish(new Pinged("b"));
		await new Promise((resolve) => setImmediate(resolve));

		expect(published).toEqual([new Pinged("a"), new Pinged("b")]);
		expect(warn).toHaveBeenCalledTimes(1);
	});
});
