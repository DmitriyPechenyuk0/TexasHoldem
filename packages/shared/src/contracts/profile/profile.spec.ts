import {
	MyProfileResponse,
	PublicProfileResponse,
	UpdateLocaleRequest,
	UpdateNicknameRequest,
} from "./index.js";

describe("profile contracts", () => {
	it("leaves the nickname rules to the api, only bounding the size", () => {
		expect(UpdateNicknameRequest.parse({ nickname: " x " })).toEqual({
			nickname: " x ",
		});
		expect(
			UpdateNicknameRequest.safeParse({ nickname: "x".repeat(257) }).success,
		).toBe(false);
	});

	it("accepts only a known locale", () => {
		expect(UpdateLocaleRequest.safeParse({ locale: "ru" }).success).toBe(true);
		expect(UpdateLocaleRequest.safeParse({ locale: "de" }).success).toBe(false);
	});

	it("shows the public only the handle, the nickname and when the player joined", () => {
		const mine = {
			userId: "0b7c6f1e-58a4-4f6b-9a39-5f0f6a8a1c2d",
			username: "alice_01",
			nickname: "Alice",
			locale: "en",
			createdAt: "2026-10-25T12:00:00.000Z",
		};

		expect(MyProfileResponse.parse(mine)).toEqual(mine);
		expect(PublicProfileResponse.parse(mine)).toEqual({
			username: "alice_01",
			nickname: "Alice",
			createdAt: "2026-10-25T12:00:00.000Z",
		});
	});
});
