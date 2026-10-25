import { UserId } from "@holdem/shared";
import type { Database } from "@/shared/infrastructure/database/index.js";
import { UserNotFoundError } from "../../../domain/user-not-found.error.js";
import { GetMeHandler } from "./get-me.handler.js";
import { GetMeQuery } from "./get-me.query.js";

const userId = UserId.parse("0b7c6f1e-58a4-4f6b-9a39-5f0f6a8a1c2d");

/** A Drizzle stand-in whose `select … from … where` resolves to `rows`. */
const databaseWith = (rows: object[]) =>
	({
		select: () => ({ from: () => ({ where: async () => rows }) }),
	}) as unknown as Database;

describe("GetMeHandler", () => {
	it("answers the user's account", async () => {
		const handler = new GetMeHandler(
			databaseWith([
				{
					id: userId,
					username: "alice",
					email: "alice@example.test",
					emailVerified: true,
					locale: "ru",
				},
			]),
		);

		await expect(handler.execute(new GetMeQuery(userId))).resolves.toEqual({
			id: userId,
			username: "alice",
			email: "alice@example.test",
			emailVerified: true,
			locale: "ru",
		});
	});

	it("reads a locale the app no longer supports as English", async () => {
		const handler = new GetMeHandler(
			databaseWith([
				{
					id: userId,
					username: "alice",
					email: "alice@example.test",
					emailVerified: false,
					locale: "de",
				},
			]),
		);

		expect((await handler.execute(new GetMeQuery(userId))).locale).toBe("en");
	});

	it("fails with identity.user-not-found when the account is gone", async () => {
		const handler = new GetMeHandler(databaseWith([]));

		const failure = handler.execute(new GetMeQuery(userId));

		await expect(failure).rejects.toBeInstanceOf(UserNotFoundError);
		await expect(failure).rejects.toMatchObject({
			kind: "not-found",
			code: "identity.user-not-found",
		});
	});
});
