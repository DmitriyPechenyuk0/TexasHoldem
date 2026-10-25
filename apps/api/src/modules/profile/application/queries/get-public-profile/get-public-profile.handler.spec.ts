import type { Database } from "@/shared/infrastructure/database/index.js";
import { GetPublicProfileHandler } from "./get-public-profile.handler.js";
import { GetPublicProfileQuery } from "./get-public-profile.query.js";

const createdAt = new Date("2026-10-25T12:00:00Z");

/** A Drizzle stand-in whose `select … from … where` resolves to `rows`. */
const databaseWith = (rows: object[]) =>
	({
		select: () => ({ from: () => ({ where: async () => rows }) }),
	}) as unknown as Database;

describe("GetPublicProfileHandler", () => {
	it("answers the public part of a profile", async () => {
		const handler = new GetPublicProfileHandler(
			databaseWith([{ username: "alice_01", nickname: "Alice", createdAt }]),
		);

		await expect(
			handler.execute(new GetPublicProfileQuery("Alice_01")),
		).resolves.toEqual({
			username: "alice_01",
			nickname: "Alice",
			createdAt: "2026-10-25T12:00:00.000Z",
		});
	});

	it("throws profile.not-found for an unknown username", async () => {
		await expect(
			new GetPublicProfileHandler(databaseWith([])).execute(
				new GetPublicProfileQuery("nobody"),
			),
		).rejects.toMatchObject({ code: "profile.not-found" });
	});
});
