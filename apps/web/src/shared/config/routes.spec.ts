import { isProtectedRoute, signInRedirectFor } from "./routes";

describe("isProtectedRoute", () => {
	it.each([
		["/settings", true],
		["/settings/profile", true],
		["/settingsx", false],
		["/", false],
		["/verify-email", false],
	])("%s → %s", (path, expected) => {
		expect(isProtectedRoute(path)).toBe(expected);
	});
});

describe("signInRedirectFor", () => {
	const locales = ["en", "ru"];

	it("sends a visitor without a session cookie to sign-in in the same locale, coming back after", () => {
		expect(
			signInRedirectFor("/ru/settings", "?tab=profile", false, locales),
		).toBe("/ru/sign-in?next=%2Fsettings%3Ftab%3Dprofile");
	});

	it.each([
		["a session cookie", "/en/settings", true],
		["a public page", "/en/verify-email", false],
		["no locale yet (the locale redirect comes first)", "/settings", false],
		["the home page", "/en", false],
	])("lets through a request with %s", (_, pathname, hasCookie) => {
		expect(signInRedirectFor(pathname, "", hasCookie, locales)).toBeNull();
	});
});
