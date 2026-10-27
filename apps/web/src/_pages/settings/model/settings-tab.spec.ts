import { isSettingsTab } from "./settings-tab";

describe("isSettingsTab", () => {
	it.each([
		["profile", true],
		["language", true],
		["billing", false],
		[["account"], false],
		[undefined, false],
	])("%j → %s", (value, expected) => {
		expect(isSettingsTab(value)).toBe(expected);
	});
});
