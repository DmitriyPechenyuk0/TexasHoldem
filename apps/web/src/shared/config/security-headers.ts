import { z } from "zod";
import { validateEnv } from "./validate-env";

export interface Header {
	readonly key: string;
	readonly value: string;
}

/** Where the pages may reach besides their own origin: the api, and the storage with the avatars. */
export interface ContentSources {
	/** The api as the browser reaches it, for its REST routes and its socket. */
	readonly apiUrl: string;
	/** Origins of the storage: where avatars are read from and uploaded to. */
	readonly storageOrigins: readonly string[];
}

const origins = z
	.string()
	.transform((value) => value.split(/[\s,]+/).filter(Boolean))
	.pipe(
		z
			.array(
				z.url({ protocol: /^https?$/ }).transform((url) => new URL(url).origin),
			)
			.min(1),
	);

const schema = z
	.object({
		NEXT_PUBLIC_API_URL: z.url({ protocol: /^https?$/ }),
		STORAGE_ORIGINS: origins,
	})
	.transform((env): ContentSources => ({
		apiUrl: env.NEXT_PUBLIC_API_URL,
		storageOrigins: env.STORAGE_ORIGINS,
	}));

/** The sources from the environment, read when Next.js loads its config. */
export const contentSourcesFromEnv = (
	env: Readonly<Record<string, string | undefined>>,
): ContentSources =>
	validateEnv(schema, {
		NEXT_PUBLIC_API_URL: env.NEXT_PUBLIC_API_URL,
		STORAGE_ORIGINS: env.STORAGE_ORIGINS,
	});

/** socket.io upgrades to a WebSocket on the api's origin, which `connect-src` names separately. */
const webSocketOrigin = (url: string): string => {
	const { origin } = new URL(url);
	return origin.replace(/^http/, "ws");
};

/**
 * A Content Security Policy by allowlist. Scripts stay `'unsafe-inline'`: Next.js inlines its own,
 * and a nonce on every response would make every page dynamic, giving up the static rendering of
 * Cache Components. What the policy still stops is loading code from, and sending data to, any
 * host not listed here. `next dev` also needs `eval` for its debugging tools.
 */
function contentSecurityPolicy(
	{ apiUrl, storageOrigins }: ContentSources,
	development: boolean,
): string {
	const api = new URL(apiUrl).origin;
	const storage = storageOrigins.join(" ");
	return [
		"default-src 'self'",
		`script-src 'self' 'unsafe-inline'${development ? " 'unsafe-eval'" : ""}`,
		"style-src 'self' 'unsafe-inline'",
		// `blob:` for the preview of a picture before it is uploaded.
		`img-src 'self' data: blob: ${storage}`,
		"font-src 'self'",
		`connect-src 'self' ${api} ${webSocketOrigin(apiUrl)} ${storage}`,
		"frame-ancestors 'none'",
		"base-uri 'self'",
		"object-src 'none'",
		"form-action 'self'",
	].join("; ");
}

/**
 * Response headers for every page (next.config.ts). HSTS only outside `next dev`, so a local
 * browser never learns to insist on HTTPS for localhost.
 */
export function securityHeaders({
	development,
	sources,
}: {
	readonly development: boolean;
	readonly sources: ContentSources;
}): Header[] {
	return [
		{
			key: "Content-Security-Policy",
			value: contentSecurityPolicy(sources, development),
		},
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
