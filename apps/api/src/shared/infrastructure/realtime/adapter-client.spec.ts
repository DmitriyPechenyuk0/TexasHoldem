import type { Redis } from "../redis/index.js";
import { adapterClient } from "./socket-io.adapter.js";

function fakeRedis() {
	const state = { isReady: true, isOpen: true };
	const xAdd = vi.fn(async () => "1-0");
	const close = vi.fn(async () => undefined);
	const destroy = vi.fn();
	const duplicateOf = Object.assign(state, {
		close,
		destroy,
		disconnect: vi.fn(),
	});
	const redis = Object.assign(
		{ isReady: true },
		{
			xAdd,
			duplicate: vi.fn(() => duplicateOf),
			options: { url: "redis://x" },
		},
	);
	return {
		redis: redis as unknown as Redis,
		publisher: redis,
		reader: duplicateOf,
		xAdd,
		close,
		destroy,
	};
}

describe("adapterClient", () => {
	it("publishes through Redis while it is ready", async () => {
		const { redis, xAdd } = fakeRedis();

		await expect(adapterClient(redis).xAdd("s", "*", { a: "1" })).resolves.toBe(
			"1-0",
		);
		expect(xAdd).toHaveBeenCalledWith("s", "*", { a: "1" });
	});

	it("fails a publish at once while Redis is not ready, instead of queueing it", async () => {
		const { redis, publisher, xAdd } = fakeRedis();
		publisher.isReady = false;

		await expect(
			adapterClient(redis).xAdd("s", "*", { a: "1" }),
		).rejects.toThrow("Redis is not ready");
		expect(xAdd).not.toHaveBeenCalled();
	});

	it("closes the reading connections it hands out, letting pending commands finish", async () => {
		const { redis, reader, close, destroy } = fakeRedis();
		const wrapped = adapterClient(redis);
		expect(wrapped.options).toEqual({ url: "redis://x" });

		await wrapped.duplicate().disconnect();
		expect(close).toHaveBeenCalled();
		expect(destroy).not.toHaveBeenCalled();

		// While Redis is down there is nothing to finish.
		reader.isReady = false;
		await wrapped.duplicate().disconnect();
		expect(destroy).toHaveBeenCalledTimes(1);
	});
});
