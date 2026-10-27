import { AVATAR_ACCEPT, avatarFileError } from "./avatar-file";

const MB = 1024 * 1024;

describe("avatarFileError", () => {
	it.each([
		[{ type: "image/png", size: 10_000 }, null],
		[{ type: "image/webp", size: 2 * MB }, null],
		[{ type: "image/jpeg", size: 2 * MB + 1 }, "size"],
		[{ type: "image/gif", size: 10 }, "type"],
		[{ type: "image/svg+xml", size: 10 }, "type"],
		[{ type: "", size: 10 }, "type"],
	])("%o → %s", (file, expected) => {
		expect(avatarFileError(file)).toBe(expected);
	});

	it("lets the picker offer only those types", () => {
		expect(AVATAR_ACCEPT).toBe("image/png,image/jpeg,image/webp");
	});
});
