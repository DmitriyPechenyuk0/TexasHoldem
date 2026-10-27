import { UserId } from "@holdem/shared";
import { Clock } from "@/shared/application/clock.js";
import { InMemoryProfiles } from "../in-memory-profiles.js";
import { CreateProfileCommand } from "./create-profile.command.js";
import { CreateProfileHandler } from "./create-profile.handler.js";

const userId = UserId.parse("0b7c6f1e-58a4-4f6b-9a39-5f0f6a8a1c2d");

class FixedClock extends Clock {
	constructor(private readonly at: Date) {
		super();
	}

	now(): Date {
		return this.at;
	}
}

describe("CreateProfileHandler", () => {
	it("creates the profile with the username as nickname, at the clock's time", async () => {
		const profiles = new InMemoryProfiles();
		const now = new Date("2026-10-25T12:00:00Z");

		await new CreateProfileHandler(profiles, new FixedClock(now)).execute(
			new CreateProfileCommand(userId, "alice_01", "ru"),
		);

		expect(profiles.rows.get(userId)).toEqual({
			userId,
			username: "alice_01",
			nickname: "alice_01",
			avatarKey: null,
			locale: "ru",
			createdAt: now,
		});
	});

	it("keeps an existing profile when the event comes again", async () => {
		const profiles = new InMemoryProfiles();
		const handler = new CreateProfileHandler(
			profiles,
			new FixedClock(new Date("2026-10-25T12:00:00Z")),
		);
		await handler.execute(new CreateProfileCommand(userId, "alice_01", "en"));
		await profiles.save({
			...profiles.rows.get(userId)!,
			nickname: "Alice" as never,
		});

		await handler.execute(new CreateProfileCommand(userId, "alice_01", "en"));

		expect(profiles.rows.get(userId)?.nickname).toBe("Alice");
	});
});
