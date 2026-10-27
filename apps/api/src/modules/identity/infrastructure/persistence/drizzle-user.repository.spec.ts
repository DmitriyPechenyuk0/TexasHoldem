import { UserId } from "@holdem/shared";
import type { Database } from "@/shared/infrastructure/database/index.js";
import { DrizzleUserRepository } from "./drizzle-user.repository.js";

const userId = UserId.parse("0b7c6f1e-58a4-4f6b-9a39-5f0f6a8a1c2d");

/** A Drizzle stand-in whose `update … returning` fails with `error`. */
const failingUpdate = (error: Error) =>
	({
		update: () => ({
			set: () => ({
				where: () => ({
					returning: async () => {
						throw error;
					},
				}),
			}),
		}),
	}) as unknown as Database;

// The happy paths and the unique violation run against Postgres in test/oauth.e2e-spec.ts.
describe("DrizzleUserRepository.chooseUsername", () => {
	it("passes on a failure other than a taken username", async () => {
		const outage = new Error("connection terminated");

		await expect(
			new DrizzleUserRepository(failingUpdate(outage)).chooseUsername(
				userId,
				"alice",
			),
		).rejects.toBe(outage);
	});
});
