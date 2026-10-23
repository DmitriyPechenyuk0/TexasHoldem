import type { AppConfig } from "../config/index.js";
import { RedisConnections } from "./redis-connections.js";

describe("RedisConnections", () => {
	it("shuts down at once when Redis was never reachable, instead of waiting for its queue", async () => {
		const connections = new RedisConnections({
			redis: { url: "redis://127.0.0.1:1" },
		} as AppConfig);
		const client = connections.open("probe");
		expect(client.isOpen).toBe(true);
		expect(client.isReady).toBe(false);

		const startedAt = Date.now();
		await connections.onApplicationShutdown();

		expect(client.isOpen).toBe(false);
		expect(Date.now() - startedAt).toBeLessThan(100);
	});
});
