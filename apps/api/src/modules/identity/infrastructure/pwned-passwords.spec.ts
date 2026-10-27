import { createHash } from "node:crypto";
import { Logger } from "@nestjs/common";
import { PWNED_RANGE_URL, PwnedPasswords } from "./pwned-passwords.js";

const PASSWORD = "correct horse battery";
const hash = createHash("sha1").update(PASSWORD).digest("hex").toUpperCase();
const [prefix, suffix] = [hash.slice(0, 5), hash.slice(5)];

/** fetch answering the range API with `body`, or failing with `error`. */
const answering = (body: string, status = 200) =>
	vi
		.spyOn(globalThis, "fetch")
		.mockResolvedValue(new Response(body, { status }));

describe("PwnedPasswords", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("sends only the first five characters of the SHA-1, with padding", async () => {
		const fetch = answering("");

		await new PwnedPasswords().isBreached(PASSWORD);

		expect(fetch).toHaveBeenCalledWith(
			`${PWNED_RANGE_URL}${prefix}`,
			expect.objectContaining({ headers: { "Add-Padding": "true" } }),
		);
		expect(JSON.stringify(fetch.mock.calls)).not.toContain(suffix);
	});

	it("finds a password among the suffixes, and ignores padding entries", async () => {
		answering(`0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n${suffix}:42\r\n`);
		expect(await new PwnedPasswords().isBreached(PASSWORD)).toBe(true);

		answering(`0018A45C4D1DEF81644B54AB7F969B88D65:3\r\n${suffix}:0`);
		expect(await new PwnedPasswords().isBreached(PASSWORD)).toBe(false);
	});

	it.each([
		["an error status", () => answering("busy", 503)],
		[
			"a network failure",
			() =>
				vi
					.spyOn(globalThis, "fetch")
					.mockRejectedValue(new TypeError("fetch failed")),
		],
	])("lets the password through on %s, with a warning", async (_case, fail) => {
		const warn = vi
			.spyOn(Logger.prototype, "warn")
			.mockImplementation(() => {});
		fail();

		expect(await new PwnedPasswords().isBreached(PASSWORD)).toBeNull();
		expect(warn).toHaveBeenCalledWith(
			expect.stringMatching(/^Breached-password check skipped/),
		);
	});
});
