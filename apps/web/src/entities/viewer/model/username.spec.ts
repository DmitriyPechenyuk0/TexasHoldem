import type { Viewer } from "../api/viewer";
import { chooseUsernameRedirect, usernameError } from "./username";

const viewer = (username: string | null): Viewer => ({
	id: "0b7c6f1e-58a4-4f6b-9a39-5f0f6a8a1c2d" as Viewer["id"],
	username,
	email: "ada@example.test",
	emailVerified: true,
	locale: "en",
});

describe("usernameError", () => {
	it.each([
		["ab", "tooShort"],
		["a".repeat(21), "tooLong"],
		["ada.lovelace", "invalid"],
		["ада", "invalid"],
		["Ada_1815", null],
	])("%j → %s", (value, expected) => {
		expect(usernameError(value)).toBe(expected);
	});
});

describe("chooseUsernameRedirect", () => {
	it("sends a viewer without a username to the username step, coming back after", () => {
		expect(chooseUsernameRedirect(viewer(null), "/settings?tab=x")).toEqual({
			pathname: "/choose-username",
			query: { next: "/settings?tab=x" },
		});
	});

	it.each([
		["a viewer with a username", viewer("ada"), "/settings"],
		["a visitor", null, "/settings"],
		["while the session loads", undefined, "/settings"],
		["the username step itself", viewer(null), "/choose-username?next=%2F"],
	])("lets %s stay", (_, who, path) => {
		expect(chooseUsernameRedirect(who, path)).toBeNull();
	});
});
