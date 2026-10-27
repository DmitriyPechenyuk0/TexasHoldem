import { UserId } from "@holdem/shared";
import { NICKNAME_LENGTH } from "@holdem/shared/contracts/profile";
import {
	NICKNAME_MAX_LENGTH,
	NICKNAME_MIN_LENGTH,
} from "../../../domain/nickname.js";
import { createProfile } from "../../../domain/profile.js";
import { InMemoryProfiles } from "../in-memory-profiles.js";
import { UpdateNicknameCommand } from "./update-nickname.command.js";
import { UpdateNicknameHandler } from "./update-nickname.handler.js";

const userId = UserId.parse("0b7c6f1e-58a4-4f6b-9a39-5f0f6a8a1c2d");
const profile = createProfile({
	userId,
	username: "alice_01",
	locale: "en",
	now: new Date("2026-10-25T12:00:00Z"),
});

describe("UpdateNicknameHandler", () => {
	it("stores the nickname as the rules leave it", async () => {
		const profiles = new InMemoryProfiles(profile);

		await new UpdateNicknameHandler(profiles).execute(
			new UpdateNicknameCommand(userId, "  Ace  of Spades "),
		);

		expect(profiles.rows.get(userId)?.nickname).toBe("Ace of Spades");
	});

	it("throws the broken rule and keeps the old nickname", async () => {
		const profiles = new InMemoryProfiles(profile);

		await expect(
			new UpdateNicknameHandler(profiles).execute(
				new UpdateNicknameCommand(userId, "x"),
			),
		).rejects.toMatchObject({ code: "profile.nickname-too-short" });
		expect(profiles.rows.get(userId)?.nickname).toBe("alice_01");
	});

	it("throws profile.not-found for a user without a profile", async () => {
		await expect(
			new UpdateNicknameHandler(new InMemoryProfiles()).execute(
				new UpdateNicknameCommand(userId, "Alice"),
			),
		).rejects.toMatchObject({ code: "profile.not-found" });
	});

	it("applies the bounds the shared contract gives forms", () => {
		expect({ min: NICKNAME_MIN_LENGTH, max: NICKNAME_MAX_LENGTH }).toEqual(
			NICKNAME_LENGTH,
		);
	});
});
