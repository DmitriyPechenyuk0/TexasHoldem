import { safeNextPath } from "./safe-next";

describe("safeNextPath", () => {
	it.each([
		["/en/tables/abc", "/en/tables/abc"],
		["/en/tables/abc?seat=3#chat", "/en/tables/abc?seat=3#chat"],
		["/", "/"],
		["/en/../ru/settings", "/ru/settings"],
	])("keeps the path %s", (next, expected) => {
		expect(safeNextPath(next)).toBe(expected);
	});

	it.each([
		["another site", "https://evil.example/"],
		["a protocol-relative URL", "//evil.example/"],
		["a backslash a browser reads as a slash", "/\\evil.example"],
		["a backslash further in", "/x/..\\..\\\\evil.example"],
		["a tab a browser drops", "/\t/evil.example"],
		["a newline", "/\n/evil.example"],
		["javascript:", "javascript:alert(1)"],
		["a relative path", "tables/abc"],
		["an empty value", ""],
		["no value", undefined],
		["a repeated parameter", ["/en", "/ru"]],
	])("refuses %s", (_, next) => {
		expect(safeNextPath(next)).toBeNull();
	});
});
