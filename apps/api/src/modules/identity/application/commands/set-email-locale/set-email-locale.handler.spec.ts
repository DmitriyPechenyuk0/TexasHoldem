import { UserId } from "@holdem/shared";
import { InMemoryUsers } from "../in-memory-users.js";
import { SetEmailLocaleCommand } from "./set-email-locale.command.js";
import { SetEmailLocaleHandler } from "./set-email-locale.handler.js";

describe("SetEmailLocaleHandler", () => {
	it("stores the language of the user's emails", async () => {
		const userId = UserId.parse("0b7c6f1e-58a4-4f6b-9a39-5f0f6a8a1c2d");
		const users = new InMemoryUsers({
			[userId]: { username: "alice", locale: "en", emailVerified: true },
		});

		await new SetEmailLocaleHandler(users).execute(
			new SetEmailLocaleCommand(userId, "ru"),
		);

		expect(users.rows.get(userId)?.locale).toBe("ru");
	});
});
