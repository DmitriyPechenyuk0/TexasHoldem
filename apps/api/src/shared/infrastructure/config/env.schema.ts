import { z } from "zod";
import type { AppConfig, OAuthClient } from "./app-config.js";

const portError = "must be a port number between 1 and 65535";
const port = z
	.string()
	.transform(Number)
	.pipe(z.int({ error: portError }).min(1, portError).max(65535, portError));
const httpUrl = z.url({ protocol: /^https?$/ });
const databaseUrl = z.url({ protocol: /^postgres(ql)?$/ });
const origin = (example: string) =>
	httpUrl.refine(
		(value) => !URL.canParse(value) || new URL(value).origin === value,
		`must be a bare origin such as ${example}, without a path or trailing slash`,
	);

/** The AUTH_SECRET in .env.example. Anyone can read it, so production refuses it. */
export const DEVELOPMENT_AUTH_SECRET =
	"local-development-only-secret-0123456789";

/** The local storage's secret key in .env.example and docker-compose.yml; production refuses it. */
export const DEVELOPMENT_S3_SECRET_ACCESS_KEY = "holdem-dev-secret";

/** Problems that only matter in production, checked alongside the schema like ENV_PAIRS. */
export function productionProblems(
	env: Readonly<Record<string, string>>,
): string[] {
	if (env.NODE_ENV !== "production") {
		return [];
	}
	return [
		...(env.AUTH_SECRET === DEVELOPMENT_AUTH_SECRET
			? [
					"AUTH_SECRET: is the public development value from .env.example; generate one with `openssl rand -base64 32`",
				]
			: []),
		...(env.S3_SECRET_ACCESS_KEY === DEVELOPMENT_S3_SECRET_ACCESS_KEY
			? [
					"S3_SECRET_ACCESS_KEY: is the public development value from .env.example; use the storage's own credentials",
				]
			: []),
		// Express then takes the client address from the leftmost X-Forwarded-For entry, which the
		// client writes itself, and every limit per address is gone.
		...(env.TRUST_PROXY === "true"
			? [
					"TRUST_PROXY: true trusts an X-Forwarded-For that any client can forge; give the number of proxies in front of the api, or their addresses",
				]
			: []),
	];
}

/**
 * Express's `trust proxy`: `false` when clients connect directly, `true` to trust every proxy, a
 * number of proxies in front of the api, or their addresses and subnets (`loopback, 10.0.0.0/8`).
 */
const trustProxy = z
	.string()
	.transform((value): boolean | number | string =>
		value === "true"
			? true
			: value === "false"
				? false
				: /^\d+$/.test(value)
					? Number(value)
					: value,
	);

// Variables that are only meaningful together; checked separately so their problems are
// reported alongside schema errors (zod skips object-level refinements once a field fails).
export const ENV_PAIRS = [
	["SMTP_USER", "SMTP_PASSWORD"],
	["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
	["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"],
	["DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET"],
] as const;

/** The bucket's address at the endpoint: `endpoint/bucket`, or `bucket.host` for virtual hosts. */
const bucketUrl = (
	endpoint: string,
	bucket: string,
	pathStyle: boolean,
): string => {
	const url = new URL(endpoint);
	if (pathStyle) {
		return `${url.origin}${url.pathname.replace(/\/+$/, "")}/${bucket}`;
	}
	url.hostname = `${bucket}.${url.hostname}`;
	return url.origin;
};

const oauthClient = (
	clientId: string | undefined,
	clientSecret: string | undefined,
): OAuthClient | undefined =>
	clientId && clientSecret ? { clientId, clientSecret } : undefined;

export const envSchema = z
	.object({
		NODE_ENV: z
			.enum(["development", "test", "production"])
			.default("development"),
		PORT: port.default(4000),
		LOG_LEVEL: z
			.enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"])
			.optional(),
		TRUST_PROXY: trustProxy.optional(),
		WEB_ORIGIN: origin("http://localhost:3000"),
		API_ORIGIN: origin("http://localhost:4000"),

		DATABASE_URL: databaseUrl,
		REDIS_URL: z.url({ protocol: /^rediss?$/ }),

		SMTP_HOST: z.string(),
		SMTP_PORT: port,
		SMTP_SECURE: z.stringbool().default(false),
		SMTP_USER: z.string().optional(),
		SMTP_PASSWORD: z.string().optional(),
		SMTP_FROM: z.string(),

		S3_ENDPOINT: httpUrl,
		S3_REGION: z.string(),
		S3_ACCESS_KEY_ID: z.string(),
		S3_SECRET_ACCESS_KEY: z.string(),
		S3_BUCKET: z.string(),
		S3_FORCE_PATH_STYLE: z.stringbool().default(false),
		S3_PUBLIC_URL: httpUrl.optional(),

		AUTH_SECRET: z
			.string()
			.min(
				32,
				"must be at least 32 characters; generate one with `openssl rand -base64 32`",
			),
		GOOGLE_CLIENT_ID: z.string().optional(),
		GOOGLE_CLIENT_SECRET: z.string().optional(),
		GITHUB_CLIENT_ID: z.string().optional(),
		GITHUB_CLIENT_SECRET: z.string().optional(),
		DISCORD_CLIENT_ID: z.string().optional(),
		DISCORD_CLIENT_SECRET: z.string().optional(),
	})
	.transform((env): AppConfig => ({
		nodeEnv: env.NODE_ENV,
		port: env.PORT,
		log: {
			level:
				env.LOG_LEVEL ?? (env.NODE_ENV === "development" ? "debug" : "info"),
			pretty: env.NODE_ENV === "development",
		},
		webOrigin: env.WEB_ORIGIN,
		apiOrigin: env.API_ORIGIN,
		trustProxy: env.TRUST_PROXY ?? false,
		database: { url: env.DATABASE_URL },
		redis: { url: env.REDIS_URL },
		smtp: {
			host: env.SMTP_HOST,
			port: env.SMTP_PORT,
			secure: env.SMTP_SECURE,
			auth:
				env.SMTP_USER && env.SMTP_PASSWORD
					? { user: env.SMTP_USER, password: env.SMTP_PASSWORD }
					: undefined,
			from: env.SMTP_FROM,
		},
		s3: {
			endpoint: env.S3_ENDPOINT,
			region: env.S3_REGION,
			accessKeyId: env.S3_ACCESS_KEY_ID,
			secretAccessKey: env.S3_SECRET_ACCESS_KEY,
			bucket: env.S3_BUCKET,
			forcePathStyle: env.S3_FORCE_PATH_STYLE,
			publicUrl: (
				env.S3_PUBLIC_URL ??
				bucketUrl(env.S3_ENDPOINT, env.S3_BUCKET, env.S3_FORCE_PATH_STYLE)
			).replace(/\/+$/, ""),
		},
		auth: {
			secret: env.AUTH_SECRET,
			oauth: {
				google: oauthClient(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET),
				github: oauthClient(env.GITHUB_CLIENT_ID, env.GITHUB_CLIENT_SECRET),
				discord: oauthClient(env.DISCORD_CLIENT_ID, env.DISCORD_CLIENT_SECRET),
			},
		},
	}));

/** Only the database settings, for tools such as drizzle-kit that need nothing else. */
export const databaseEnvSchema = z
	.object({ DATABASE_URL: databaseUrl })
	.transform((env): AppConfig["database"] => ({ url: env.DATABASE_URL }));
