import type { Redis } from "../redis/index.js";
import { failingFastWhileDown } from "./socket-io.adapter.js";

function fakeRedis() {
	const state = { isReady: true };
	const xAdd = vi.fn(async () => "1-0");
	const duplicate = vi.fn(() => "duplicate");
	const redis = Object.assign(state, {
		xAdd,
		duplicate,
		options: { url: "redis://x" },
	});
	return { redis: redis as unknown as Redis, state, xAdd, duplicate };
}

describe("failingFastWhileDown", () => {
	it("publishes through Redis while it is ready", async () => {
		const { redis, xAdd } = fakeRedis();

		await expect(
			failingFastWhileDown(redis).xAdd("s", "*", { a: "1" }),
		).resolves.toBe("1-0");
		expect(xAdd).toHaveBeenCalledWith("s", "*", { a: "1" });
	});

	it("fails a publish at once while Redis is not ready, instead of queueing it", async () => {
		const { redis, state, xAdd } = fakeRedis();
		state.isReady = false;

		await expect(
			failingFastWhileDown(redis).xAdd("s", "*", { a: "1" }),
		).rejects.toThrow("Redis is not ready");
		expect(xAdd).not.toHaveBeenCalled();
	});

	it("leaves everything else as it is, so the adapter's reading connections wait for Redis", () => {
		const { redis, state, duplicate } = fakeRedis();
		state.isReady = false;
		const wrapped = failingFastWhileDown(redis);

		expect(wrapped.duplicate()).toBe("duplicate");
		expect(duplicate).toHaveBeenCalled();
		expect(wrapped.options).toEqual({ url: "redis://x" });
	});
});
