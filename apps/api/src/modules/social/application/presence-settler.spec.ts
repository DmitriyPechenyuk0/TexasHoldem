import { Logger } from "@nestjs/common";
import type { EventBus } from "@nestjs/cqrs";
import { PresenceChanged } from "./events/presence-changed.event.js";
import { InMemoryPresence } from "./in-memory-presence.js";
import {
	OFFLINE_GRACE_MS,
	PresenceSettler,
	SWEEP_EVERY_MS,
} from "./presence-settler.js";

function setUp() {
	const presence = new InMemoryPresence();
	const published: unknown[] = [];
	const eventBus = {
		publish: (event: unknown) => published.push(event),
	} as unknown as EventBus;
	return {
		presence,
		published,
		settler: new PresenceSettler(presence, eventBus),
	};
}

describe("PresenceSettler", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("takes a player offline once the grace period is over, and only then", async () => {
		const { presence, published, settler } = setUp();
		await presence.connect("u-1", "a");
		await presence.disconnect("u-1", "a");

		settler.later("u-1");
		await vi.advanceTimersByTimeAsync(OFFLINE_GRACE_MS - 1);
		expect(published).toEqual([]);
		settler.later("u-1");
		await vi.advanceTimersByTimeAsync(OFFLINE_GRACE_MS);

		expect(published).toEqual([new PresenceChanged("u-1")]);
	});

	it("keeps a player online who connected again in time", async () => {
		const { presence, published, settler } = setUp();
		await presence.connect("u-1", "a");
		await presence.disconnect("u-1", "a");

		settler.later("u-1");
		await presence.connect("u-1", "b");
		await vi.advanceTimersByTimeAsync(OFFLINE_GRACE_MS);

		expect(published).toEqual([]);
	});

	it("sweeps players whose connections ran out elsewhere, and warns when it cannot", async () => {
		const warn = vi
			.spyOn(Logger.prototype, "warn")
			.mockImplementation(() => {});
		const { presence, published, settler } = setUp();
		presence.online.add("u-2");
		settler.onModuleInit();

		await vi.advanceTimersByTimeAsync(SWEEP_EVERY_MS);
		expect(published).toEqual([new PresenceChanged("u-2")]);

		vi.spyOn(presence, "shownOnline").mockRejectedValueOnce(new Error("down"));
		await vi.advanceTimersByTimeAsync(SWEEP_EVERY_MS);
		expect(warn).toHaveBeenCalledWith(
			expect.objectContaining({ msg: "presence not swept" }),
		);

		settler.later("u-3");
		settler.onModuleDestroy();
		settler.onModuleDestroy();
		await vi.advanceTimersByTimeAsync(SWEEP_EVERY_MS);
		expect(published).toHaveLength(1);
	});
});
