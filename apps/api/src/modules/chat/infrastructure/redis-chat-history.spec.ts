import type { AppConfig } from "@/shared/infrastructure/config/index.js";
import type { Redis } from "@/shared/infrastructure/redis/index.js";
import {
	CLOSED_CHAT_TTL_SECONDS,
	RedisChatHistory,
} from "./redis-chat-history.js";

describe("RedisChatHistory", () => {
	it("lets a closed table's chat go after an hour", async () => {
		const expire = vi.fn(async () => 1);
		const history = new RedisChatHistory(
			{ expire } as unknown as Redis,
			{ database: { url: "postgres://localhost/holdem" } } as AppConfig,
		);

		await history.tableClosed("t-1");

		expect(expire).toHaveBeenCalledWith(
			"holdem:chat:t-1",
			CLOSED_CHAT_TTL_SECONDS,
		);
	});
});
