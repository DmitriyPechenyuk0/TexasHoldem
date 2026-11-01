import { Logger } from "@nestjs/common";
import type { Clock } from "@/shared/application/clock.js";
import type { AppConfig } from "@/shared/infrastructure/config/index.js";
import type { Redis } from "@/shared/infrastructure/redis/index.js";
import {
	CONNECTION_TTL_MS,
	RedisPlayerPresence,
} from "./redis-player-presence.js";

const down = new Error("The client is closed");

/** A Redis whose script answers come from `replies`; an Error is thrown instead of returned. */
function redisReplying(...replies: (number | Error)[]) {
	const next = async () => {
		const reply = replies.shift();
		if (reply instanceof Error) {
			throw reply;
		}
		return reply;
	};
	const batch = {
		zAdd: vi.fn(),
		pExpire: vi.fn(),
		exec: vi.fn(async () => []),
	};
	const redis = {
		eval: vi.fn(next),
		zRem: vi.fn(next),
		multi: () => batch,
	} as unknown as Redis;
	const clock = { now: () => new Date(Date.now()) } as Clock;
	const config = {
		database: { url: "postgres://localhost/holdem" },
	} as AppConfig;
	return {
		presence: new RedisPlayerPresence(redis, clock, config),
		redis,
		batch,
	};
}

describe("RedisPlayerPresence", () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("answers whether a connection shows the player online, and whether settling took them offline", async () => {
		const { presence, redis } = redisReplying(1, 0, 1, 0);

		expect(await presence.connect("u-1", "a")).toBe(true);
		expect(await presence.connect("u-1", "b")).toBe(false);
		expect(await presence.settle("u-1")).toBe(true);
		expect(await presence.settle("u-1")).toBe(false);
		expect(redis.eval).toHaveBeenCalledWith(expect.any(String), {
			keys: ["holdem:presence:connections:u-1", "holdem:presence:online"],
			arguments: [expect.any(String), "u-1"],
		});
	});

	it("changes nobody's presence while Redis fails, and warns once per outage", async () => {
		const warn = vi
			.spyOn(Logger.prototype, "warn")
			.mockImplementation(() => {});
		const { presence } = redisReplying(down, down, down, 1, down);

		expect(await presence.connect("u-1", "a")).toBe(false);
		await presence.disconnect("u-1", "a");
		expect(await presence.settle("u-1")).toBe(false);
		expect(await presence.connect("u-1", "a")).toBe(true);
		await presence.disconnect("u-1", "a");

		expect(warn).toHaveBeenCalledTimes(2);
		expect(warn).toHaveBeenCalledWith(
			"Presence stays as it is until Redis answers: The client is closed",
		);
	});

	it("refreshes the connections it holds well before they run out, and only those", async () => {
		vi.useFakeTimers();
		const warn = vi
			.spyOn(Logger.prototype, "warn")
			.mockImplementation(() => {});
		const { presence, batch } = redisReplying(1, 0, 1);
		presence.onModuleInit();
		await vi.advanceTimersByTimeAsync(CONNECTION_TTL_MS / 2);
		expect(batch.exec).not.toHaveBeenCalled();
		await presence.connect("u-1", "a");
		await presence.connect("u-1", "b");
		await presence.disconnect("u-1", "a");

		await vi.advanceTimersByTimeAsync(CONNECTION_TTL_MS / 2);

		expect(batch.zAdd).toHaveBeenCalledWith("holdem:presence:connections:u-1", [
			{ score: expect.any(Number), value: "b" },
		]);
		expect(batch.pExpire).toHaveBeenCalledWith(
			"holdem:presence:connections:u-1",
			CONNECTION_TTL_MS,
		);

		batch.exec.mockRejectedValueOnce(down);
		await vi.advanceTimersByTimeAsync(CONNECTION_TTL_MS / 3);
		presence.onModuleDestroy();
		presence.onModuleDestroy();
		expect(warn).toHaveBeenCalledTimes(1);
	});

	it("knows nothing of nobody without asking", async () => {
		const { presence } = redisReplying();

		expect(await presence.whereabouts([])).toEqual(new Map());
	});
});
