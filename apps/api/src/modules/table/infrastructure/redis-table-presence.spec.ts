import { Logger } from "@nestjs/common";
import type { Clock } from "@/shared/application/clock.js";
import type { Redis } from "@/shared/infrastructure/redis/index.js";
import { PRESENCE_TTL_MS, RedisTablePresence } from "./redis-table-presence.js";

/** A Redis whose script answers come from `replies`; an Error is thrown instead of returned. */
function redisReplying(...replies: (number | Error)[]) {
	const evalMock = vi.fn(async () => {
		const reply = replies.shift();
		if (reply instanceof Error) {
			throw reply;
		}
		return reply;
	});
	const batch = {
		zAdd: vi.fn(),
		pExpire: vi.fn(),
		exec: vi.fn(async () => []),
	};
	const redis = {
		eval: evalMock,
		multi: () => batch,
	} as unknown as Redis;
	const clock = { now: () => new Date(Date.now()) } as Clock;
	return { presence: new RedisTablePresence(redis, clock), evalMock, batch };
}

describe("RedisTablePresence", () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("answers whether a connection is the user's first, and whether one was their last", async () => {
		const { presence, evalMock } = redisReplying(0, 1, 1, 0);

		expect(await presence.connect("t-1", "u0", "a")).toBe(true);
		expect(await presence.connect("t-1", "u0", "b")).toBe(false);
		expect(await presence.disconnect("t-1", "u0", "a")).toBe(false);
		expect(await presence.disconnect("t-1", "u0", "b")).toBe(true);
		expect(evalMock).toHaveBeenCalledWith(expect.any(String), {
			keys: ["table-presence:t-1:u0"],
			arguments: [expect.any(String), "b"],
		});
	});

	it("reports nobody back or gone while Redis fails, and warns once per outage", async () => {
		const warn = vi
			.spyOn(Logger.prototype, "warn")
			.mockImplementation(() => {});
		const down = new Error("The client is closed");
		const { presence } = redisReplying(down, down, 0, down);

		expect(await presence.connect("t-1", "u0", "a")).toBe(false);
		expect(await presence.disconnect("t-1", "u0", "a")).toBe(false);
		expect(await presence.connect("t-1", "u0", "a")).toBe(true);
		expect(await presence.disconnect("t-1", "u0", "a")).toBe(false);

		expect(warn).toHaveBeenCalledTimes(2);
		expect(warn).toHaveBeenCalledWith(
			"Table presence is unknown until Redis answers: The client is closed",
		);
	});

	it("refreshes the connections it holds well before they run out, and only those", async () => {
		vi.useFakeTimers();
		const { presence, batch } = redisReplying(0, 1, 1);
		presence.onModuleInit();
		await presence.connect("t-1", "u0", "a");
		await presence.connect("t-1", "u0", "b");
		await presence.disconnect("t-1", "u0", "a");

		await vi.advanceTimersByTimeAsync(PRESENCE_TTL_MS / 2);
		presence.onModuleDestroy();

		expect(batch.zAdd).toHaveBeenCalledWith("table-presence:t-1:u0", [
			{ score: expect.any(Number), value: "b" },
		]);
		expect(batch.pExpire).toHaveBeenCalledWith(
			"table-presence:t-1:u0",
			PRESENCE_TTL_MS,
		);
	});
});
