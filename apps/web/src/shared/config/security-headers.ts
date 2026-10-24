export interface Header {
	readonly key: string;
	readonly value: string;
}

/**
 * The part of a Content Security Policy that does not depend on scripts. A `script-src` without
 * `'unsafe-inline'` needs a nonce on every response, which makes every page dynamic and gives up
 * the static rendering of Cache Components; it is left for when pages render per request anyway.
 */
const CONTENT_SECURITY_POLICY = [
	"frame-ancestors 'none'",
	"base-uri 'self'",
	"object-src 'none'",
	"form-action 'self'",
].join("; ");

/**
 * Response headers for every page (next.config.ts). HSTS only outside `next dev`, so a local
 * browser never learns to insist on HTTPS for localhost.
 */
export function securityHeaders({
	development,
}: {
	readonly development: boolean;
}): Header[] {
	return [
		{ key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY },
		{ key: "X-Frame-Options", value: "DENY" },
		{ key: "X-Content-Type-Options", value: "nosniff" },
		{ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
		{
			key: "Permissions-Policy",
			value: "camera=(), microphone=(), geolocation=(), payment=()",
		},
		...(development
			? []
			: [
					{
						key: "Strict-Transport-Security",
						value: "max-age=63072000; includeSubDomains",
					},
				]),
	];
}
