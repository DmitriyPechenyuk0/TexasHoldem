import { z } from "zod";
import type { AppConfig, OAuthClient } from "./app-config.js";

const portError = "must be a port number between 1 and 65535";
const port = z
	.string()
	.transform(Number)
	.pipe(z.int({ error: portError }).min(1, portError).max(65535, portError));
const httpUrl = z.url({ protocol: /^https?$/ });

// Variables that are only meaningful together; checked separately so their problems are
// reported alongside schema errors (zod skips object-level refinements once a field fails).
export const ENV_PAIRS = [
	["SMTP_USER", "SMTP_PASSWORD"],
	["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
	["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"],
	["DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET"],
] as const;

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
		WEB_ORIGIN: httpUrl.refine(
			(value) => !URL.canParse(value) || new URL(value).origin === value,
			"must be a bare origin such as http://localhost:3000, without a path or trailing slash",
		),

		DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
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
		webOrigin: env.WEB_ORIGIN,
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
