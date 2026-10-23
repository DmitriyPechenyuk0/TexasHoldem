import { HealthIndicator } from "@/shared/application/health-indicator.js";
import {
	CHECK_TIMEOUT_MS,
	GetReadinessHandler,
} from "./get-readiness.handler.js";

const indicator = (
	name: string,
	isHealthy: () => Promise<boolean>,
): HealthIndicator => ({ name, isHealthy });

describe("GetReadinessHandler", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("is ready when every dependency answers", async () => {
		const handler = new GetReadinessHandler([
			indicator("database", async () => true),
			indicator("redis", async () => true),
		]);

		await expect(handler.execute()).resolves.toEqual({
			ready: true,
			checks: { database: "up", redis: "up" },
		});
	});

	it("is not ready when one dependency is down or throws", async () => {
		const handler = new GetReadinessHandler([
			indicator("database", async () => true),
			indicator("redis", async () => false),
			indicator("storage", async () => {
				throw new Error("unreachable");
			}),
		]);

		await expect(handler.execute()).resolves.toEqual({
			ready: false,
			checks: { database: "up", redis: "down", storage: "down" },
		});
	});

	it("counts a dependency that does not answer in time as down", async () => {
		vi.useFakeTimers();
		const handler = new GetReadinessHandler([
			indicator("database", async () => true),
			indicator("redis", () => new Promise<boolean>(() => undefined)),
		]);

		const readiness = handler.execute();
		await vi.advanceTimersByTimeAsync(CHECK_TIMEOUT_MS);

		await expect(readiness).resolves.toEqual({
			ready: false,
			checks: { database: "up", redis: "down" },
		});
	});
});
