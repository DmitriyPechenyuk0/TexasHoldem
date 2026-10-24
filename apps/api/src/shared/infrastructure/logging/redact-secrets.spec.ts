import { REDACTED, redactSecrets } from "./redact-secrets.js";

describe("redactSecrets", () => {
	it("replaces secret-looking keys in any case and at any depth", () => {
		expect(
			redactSecrets({
				event: "sign-in",
				passed: true,
				password: "p",
				headers: { Authorization: "Bearer t", "Set-Cookie": "s=1" },
				a: { b: { c: { d: { refreshToken: "r", apiKey: "k" } } } },
				list: [{ clientSecret: "c" }, "plain"],
			}),
		).toEqual({
			event: "sign-in",
			passed: true,
			password: REDACTED,
			headers: { Authorization: REDACTED, "Set-Cookie": REDACTED },
			a: { b: { c: { d: { refreshToken: REDACTED, apiKey: REDACTED } } } },
			list: [{ clientSecret: REDACTED }, "plain"],
		});
	});

	it("leaves errors and plain values alone, and cuts cycles", () => {
		const error = new Error("boom");
		const cyclic: Record<string, unknown> = { name: "ann" };
		cyclic.self = cyclic;

		expect(redactSecrets(error)).toBe(error);
		expect(redactSecrets("text")).toBe("text");
		expect(redactSecrets(null)).toBeNull();
		expect(redactSecrets(cyclic)).toEqual({ name: "ann", self: cyclic });
	});
});
