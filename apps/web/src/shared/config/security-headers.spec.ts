import {
	type ContentSources,
	contentSourcesFromEnv,
	securityHeaders,
} from "./security-headers";
import { EnvError } from "./validate-env";

const sources: ContentSources = {
	apiUrl: "https://api.holdem.example",
	storageOrigins: ["https://cdn.holdem.example", "https://s3.holdem.example"],
};

const byKey = (development: boolean) =>
	Object.fromEntries(
		securityHeaders({ development, sources }).map(({ key, value }) => [
			key,
			value,
		]),
	);

const directives = (development: boolean): Record<string, string> =>
	Object.fromEntries(
		byKey(development)
			["Content-Security-Policy"]!.split("; ")
			.map((directive) => {
				const [name, ...values] = directive.split(" ");
				return [name, values.join(" ")];
			}),
	);

describe("securityHeaders", () => {
	it("forbids framing, sniffing and plugins, and limits the referrer", () => {
		expect(byKey(false)).toMatchObject({
			"X-Frame-Options": "DENY",
			"X-Content-Type-Options": "nosniff",
			"Referrer-Policy": "strict-origin-when-cross-origin",
		});
		expect(directives(false)).toMatchObject({
			"frame-ancestors": "'none'",
			"object-src": "'none'",
			"base-uri": "'self'",
			"form-action": "'self'",
		});
	});

	it("loads code only from the site, and reaches only the api and the storage", () => {
		expect(directives(false)).toMatchObject({
			"default-src": "'self'",
			"script-src": "'self' 'unsafe-inline'",
			"img-src":
				"'self' data: blob: https://cdn.holdem.example https://s3.holdem.example",
			"connect-src":
				"'self' https://api.holdem.example wss://api.holdem.example https://cdn.holdem.example https://s3.holdem.example",
		});
	});

	it("allows eval under next dev only, which its debugging tools need", () => {
		expect(directives(true)["script-src"]).toBe(
			"'self' 'unsafe-inline' 'unsafe-eval'",
		);
	});

	it("sends HSTS everywhere but under next dev", () => {
		expect(byKey(false)["Strict-Transport-Security"]).toContain("max-age=");
		expect(byKey(true)).not.toHaveProperty("Strict-Transport-Security");
	});
});

describe("contentSourcesFromEnv", () => {
	it("reads the api and the storage origins, separated by spaces or commas", () => {
		expect(
			contentSourcesFromEnv({
				NEXT_PUBLIC_API_URL: "http://localhost:4000",
				STORAGE_ORIGINS: "http://127.0.0.1:9000/avatars, https://cdn.example ",
			}),
		).toEqual({
			apiUrl: "http://localhost:4000",
			storageOrigins: ["http://127.0.0.1:9000", "https://cdn.example"],
		});
	});

	it("refuses a missing or invalid storage origin", () => {
		for (const STORAGE_ORIGINS of [undefined, "javascript:alert(1)", " , "]) {
			expect(() =>
				contentSourcesFromEnv({
					NEXT_PUBLIC_API_URL: "http://localhost:4000",
					STORAGE_ORIGINS,
				}),
			).toThrow(EnvError);
		}
	});
});
