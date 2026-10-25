import type { Redis } from "@/shared/infrastructure/redis/index.js";
import {
	EMAIL_COOLDOWN_SECONDS,
	EmailCooldown,
	emailCooldownKey,
} from "./email-cooldown.js";

const redisAnswering = (set: () => Promise<string | null>) =>
	({ set: vi.fn(set) }) as unknown as Redis & { set: ReturnType<typeof vi.fn> };

describe("EmailCooldown", () => {
	it("claims the address for a minute, under a key that is the same in any case", async () => {
		const redis = redisAnswering(async () => "OK");

		await expect(
			new EmailCooldown(redis).claim("verify-email", "Alice@Example.test"),
		).resolves.toBe(true);
		expect(redis.set).toHaveBeenCalledWith(
			emailCooldownKey("verify-email", "alice@example.test"),
			"1",
			{
				condition: "NX",
				expiration: { type: "EX", value: EMAIL_COOLDOWN_SECONDS },
			},
		);
	});

	it("refuses while the address is cooling down", async () => {
		await expect(
			new EmailCooldown(redisAnswering(async () => null)).claim(
				"verify-email",
				"alice@example.test",
			),
		).resolves.toBe(false);
	});

	it("lets the email go when Redis is unavailable", async () => {
		const redis = redisAnswering(async () => {
			throw new Error("The client is closed");
		});

		await expect(
			new EmailCooldown(redis).claim("verify-email", "alice@example.test"),
		).resolves.toBe(true);
	});
});
