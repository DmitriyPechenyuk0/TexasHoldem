import {
	changeAvatar,
	changeLocale,
	createProfile,
	renameProfile,
} from "./profile.js";

const created = createProfile({
	userId: "0b7c6f1e-58a4-4f6b-9a39-5f0f6a8a1c2d",
	username: "alice_01",
	locale: "en",
	now: new Date("2026-10-25T12:00:00Z"),
});

describe("Profile", () => {
	it("starts with the username as its nickname and no avatar", () => {
		expect(created).toEqual({
			userId: "0b7c6f1e-58a4-4f6b-9a39-5f0f6a8a1c2d",
			username: "alice_01",
			nickname: "alice_01",
			avatarKey: null,
			locale: "en",
			createdAt: new Date("2026-10-25T12:00:00Z"),
		});
	});

	it("takes a new nickname by its rules and keeps everything else", () => {
		const renamed = renameProfile(created, "  Alice  ");
		const refused = renameProfile(created, "a");

		expect(renamed).toEqual({
			ok: true,
			value: { ...created, nickname: "Alice" },
		});
		expect(!refused.ok && refused.error.code).toBe(
			"profile.nickname-too-short",
		);
	});

	it("changes the locale", () => {
		expect(changeLocale(created, "ru")).toEqual({ ...created, locale: "ru" });
	});

	it("takes a new avatar and names the one it replaces", () => {
		const first = changeAvatar(created, "avatars/u/1.webp");
		const second = changeAvatar(first.profile, "avatars/u/2.webp");
		const removed = changeAvatar(second.profile, null);

		expect(first).toEqual({
			profile: { ...created, avatarKey: "avatars/u/1.webp" },
			replacedKey: null,
		});
		expect(second.replacedKey).toBe("avatars/u/1.webp");
		expect(removed).toEqual({
			profile: { ...created, avatarKey: null },
			replacedKey: "avatars/u/2.webp",
		});
	});
});
