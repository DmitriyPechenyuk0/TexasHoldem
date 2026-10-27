import { UserId } from "@holdem/shared";
import type { Database } from "@/shared/infrastructure/database/index.js";
import { InMemoryObjectStorage } from "../../../../../../test/support/in-memory-object-storage.js";
import { GetMyProfileHandler } from "./get-my-profile.handler.js";
import { GetMyProfileQuery } from "./get-my-profile.query.js";

const userId = UserId.parse("0b7c6f1e-58a4-4f6b-9a39-5f0f6a8a1c2d");
const createdAt = new Date("2026-10-25T12:00:00Z");

/** A Drizzle stand-in whose `select … from … where` resolves to `rows`. */
const databaseWith = (rows: object[]) =>
	({
		select: () => ({ from: () => ({ where: async () => rows }) }),
	}) as unknown as Database;

describe("GetMyProfileHandler", () => {
	it("answers the profile with an ISO date, and an unsupported locale as English", async () => {
		const handler = new GetMyProfileHandler(
			databaseWith([
				{
					userId,
					username: "alice_01",
					nickname: "Alice",
					avatarKey: "avatars/u/a.webp",
					locale: "de",
					createdAt,
				},
			]),
			new InMemoryObjectStorage(),
		);

		await expect(
			handler.execute(new GetMyProfileQuery(userId)),
		).resolves.toEqual({
			userId,
			username: "alice_01",
			nickname: "Alice",
			avatarUrl: "https://cdn.test/avatars/u/a.webp",
			locale: "en",
			createdAt: "2026-10-25T12:00:00.000Z",
		});
	});

	it("throws profile.not-found without a profile", async () => {
		await expect(
			new GetMyProfileHandler(
				databaseWith([]),
				new InMemoryObjectStorage(),
			).execute(new GetMyProfileQuery(userId)),
		).rejects.toMatchObject({ code: "profile.not-found" });
	});
});
