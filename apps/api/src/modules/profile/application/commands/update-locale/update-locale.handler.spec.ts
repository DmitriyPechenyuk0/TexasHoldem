import { UserId } from "@holdem/shared";
import type { CommandBus } from "@nestjs/cqrs";
import { SetEmailLocaleCommand } from "@/modules/identity/index.js";
import { createProfile } from "../../../domain/profile.js";
import { InMemoryProfiles } from "../in-memory-profiles.js";
import { UpdateLocaleCommand } from "./update-locale.command.js";
import { UpdateLocaleHandler } from "./update-locale.handler.js";

const userId = UserId.parse("0b7c6f1e-58a4-4f6b-9a39-5f0f6a8a1c2d");
const profile = createProfile({
	userId,
	username: "alice_01",
	locale: "en",
	now: new Date("2026-10-25T12:00:00Z"),
});

const recordingBus = () => {
	const sent: unknown[] = [];
	const bus = {
		execute: async (command: unknown) => {
			sent.push(command);
		},
	} as unknown as CommandBus;
	return { bus, sent };
};

describe("UpdateLocaleHandler", () => {
	it("stores the locale and has identity send emails in it", async () => {
		const profiles = new InMemoryProfiles(profile);
		const { bus, sent } = recordingBus();

		await new UpdateLocaleHandler(profiles, bus).execute(
			new UpdateLocaleCommand(userId, "ru"),
		);

		expect(profiles.rows.get(userId)?.locale).toBe("ru");
		expect(sent).toEqual([new SetEmailLocaleCommand(userId, "ru")]);
	});

	it("throws profile.not-found and tells identity nothing", async () => {
		const { bus, sent } = recordingBus();

		await expect(
			new UpdateLocaleHandler(new InMemoryProfiles(), bus).execute(
				new UpdateLocaleCommand(userId, "ru"),
			),
		).rejects.toMatchObject({ code: "profile.not-found" });
		expect(sent).toEqual([]);
	});
});
