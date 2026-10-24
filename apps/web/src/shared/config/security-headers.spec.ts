import { securityHeaders } from "./security-headers";

const byKey = (development: boolean) =>
	Object.fromEntries(
		securityHeaders({ development }).map(({ key, value }) => [key, value]),
	);

describe("securityHeaders", () => {
	it("forbids framing, sniffing and plugins, and limits the referrer", () => {
		expect(byKey(false)).toMatchObject({
			"Content-Security-Policy": expect.stringContaining(
				"frame-ancestors 'none'",
			),
			"X-Frame-Options": "DENY",
			"X-Content-Type-Options": "nosniff",
			"Referrer-Policy": "strict-origin-when-cross-origin",
		});
		expect(byKey(false)["Content-Security-Policy"]).toContain(
			"object-src 'none'",
		);
	});

	it("sends HSTS everywhere but under next dev", () => {
		expect(byKey(false)["Strict-Transport-Security"]).toContain("max-age=");
		expect(byKey(true)).not.toHaveProperty("Strict-Transport-Security");
	});
});
