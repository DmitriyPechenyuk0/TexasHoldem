import { type Locale, UserId } from "@holdem/shared";
import { UserRepository } from "../../user.repository.js";
import { SetEmailLocaleCommand } from "./set-email-locale.command.js";
import { SetEmailLocaleHandler } from "./set-email-locale.handler.js";

class RecordingUsers extends UserRepository {
	readonly locales = new Map<UserId, Locale>();

	async setLocale(userId: UserId, locale: Locale): Promise<void> {
		this.locales.set(userId, locale);
	}
}

describe("SetEmailLocaleHandler", () => {
	it("stores the language of the user's emails", async () => {
		const users = new RecordingUsers();
		const userId = UserId.parse("0b7c6f1e-58a4-4f6b-9a39-5f0f6a8a1c2d");

		await new SetEmailLocaleHandler(users).execute(
			new SetEmailLocaleCommand(userId, "ru"),
		);

		expect(users.locales.get(userId)).toBe("ru");
	});
});
