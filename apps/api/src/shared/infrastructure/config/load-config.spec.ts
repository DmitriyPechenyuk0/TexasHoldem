import { exampleEnv } from "../../../../test/support/example-config.js";
import {
	ConfigError,
	parseConfig,
	parseDatabaseConfig,
} from "./load-config.js";
import { DEVELOPMENT_AUTH_SECRET } from "./env.schema.js";

/** `.env.example` as production would run it: with a secret of its own. */
const productionEnv = () => ({
	...exampleEnv(),
	NODE_ENV: "production",
	AUTH_SECRET: "a-real-secret-generated-for-production-0123",
});

const problemsOf = (
	env: Record<string, string | undefined>,
): readonly string[] => {
	try {
		parseConfig(env);
	} catch (error) {
		if (error instanceof ConfigError) return error.problems;
		throw error;
	}
	throw new Error("expected parseConfig to throw ConfigError");
};

describe("parseConfig", () => {
	it("accepts .env.example and maps it to AppConfig", () => {
		const config = parseConfig(exampleEnv());

		expect(config).toMatchObject({
			nodeEnv: "development",
			port: 4000,
			webOrigin: "http://localhost:3000",
			apiOrigin: "http://localhost:4000",
			database: { url: "postgres://holdem:holdem@127.0.0.1:5433/holdem" },
			smtp: {
				host: "127.0.0.1",
				port: 1025,
				secure: false,
				from: "Texas Hold'em <no-reply@holdem.local>",
			},
			s3: { bucket: "avatars", forcePathStyle: true },
		});
		expect(config.smtp.auth).toBeUndefined();
		expect(config.auth.oauth).toEqual({
			google: undefined,
			github: undefined,
			discord: undefined,
		});
	});

	it("lists every missing required variable at once", () => {
		expect(problemsOf({})).toEqual([
			"API_ORIGIN: is required",
			"AUTH_SECRET: is required",
			"DATABASE_URL: is required",
			"REDIS_URL: is required",
			"S3_ACCESS_KEY_ID: is required",
			"S3_BUCKET: is required",
			"S3_ENDPOINT: is required",
			"S3_REGION: is required",
			"S3_SECRET_ACCESS_KEY: is required",
			"SMTP_FROM: is required",
			"SMTP_HOST: is required",
			"SMTP_PORT: is required",
			"WEB_ORIGIN: is required",
		]);
	});

	it("treats empty values as unset", () => {
		expect(problemsOf({ ...exampleEnv(), DATABASE_URL: "" })).toEqual([
			"DATABASE_URL: is required",
		]);
	});

	it("reports invalid values together with unpaired variables", () => {
		const problems = problemsOf({
			...exampleEnv(),
			PORT: "http",
			WEB_ORIGIN: "http://localhost:3000/",
			DATABASE_URL: "mysql://localhost/holdem",
			SMTP_SECURE: "maybe",
			AUTH_SECRET: "short",
			SMTP_USER: "mailer",
			GITHUB_CLIENT_SECRET: "secret",
		});

		expect(problems.map((problem) => problem.split(":")[0])).toEqual([
			"AUTH_SECRET",
			"DATABASE_URL",
			"GITHUB_CLIENT_ID",
			"PORT",
			"SMTP_PASSWORD",
			"SMTP_SECURE",
			"WEB_ORIGIN",
		]);
		expect(problems).toContain(
			"SMTP_PASSWORD: is required when SMTP_USER is set",
		);
		expect(problems).toContain(
			"GITHUB_CLIENT_ID: is required when GITHUB_CLIENT_SECRET is set",
		);
	});

	it("never echoes variable values in problems", () => {
		const problems = problemsOf({
			...exampleEnv(),
			AUTH_SECRET: "leaky",
			S3_ENDPOINT: "not-a-url",
		});

		expect(problems.join("\n")).not.toMatch(/leaky|not-a-url/);
	});

	it("enables SMTP auth and OAuth providers only when both values are set", () => {
		const config = parseConfig({
			...exampleEnv(),
			SMTP_USER: "mailer",
			SMTP_PASSWORD: "password",
			DISCORD_CLIENT_ID: "discord-id",
			DISCORD_CLIENT_SECRET: "discord-secret",
		});

		expect(config.smtp.auth).toEqual({ user: "mailer", password: "password" });
		expect(config.auth.oauth.discord).toEqual({
			clientId: "discord-id",
			clientSecret: "discord-secret",
		});
		expect(config.auth.oauth.google).toBeUndefined();
	});
});

describe("parseDatabaseConfig", () => {
	it("needs only DATABASE_URL", () => {
		expect(
			parseDatabaseConfig({
				DATABASE_URL: "postgres://holdem:holdem@127.0.0.1:5433/holdem_test",
			}),
		).toEqual({ url: "postgres://holdem:holdem@127.0.0.1:5433/holdem_test" });
	});

	it("reports a missing or invalid DATABASE_URL like parseConfig", () => {
		expect(() => parseDatabaseConfig({})).toThrow(/DATABASE_URL: is required/);
		expect(() =>
			parseDatabaseConfig({ DATABASE_URL: "mysql://localhost/holdem" }),
		).toThrow(ConfigError);
	});
});

describe("log settings", () => {
	it("default to readable debug output in development and JSON info elsewhere", () => {
		expect(parseConfig(exampleEnv()).log).toEqual({
			level: "debug",
			pretty: true,
		});
		expect(parseConfig(productionEnv()).log).toEqual({
			level: "info",
			pretty: false,
		});
	});

	it("take LOG_LEVEL when it is set and reject unknown levels", () => {
		expect(parseConfig({ ...productionEnv(), LOG_LEVEL: "warn" }).log).toEqual({
			level: "warn",
			pretty: false,
		});
		expect(problemsOf({ ...exampleEnv(), LOG_LEVEL: "loud" })).toEqual([
			expect.stringMatching(/^LOG_LEVEL: /),
		]);
	});
});

describe("trust proxy", () => {
	it.each([
		[undefined, false],
		["false", false],
		["true", true],
		["1", 1],
		["loopback, 10.0.0.0/8", "loopback, 10.0.0.0/8"],
	])("TRUST_PROXY=%s is %s", (value, expected) => {
		expect(
			parseConfig({ ...exampleEnv(), TRUST_PROXY: value }).trustProxy,
		).toBe(expected);
	});
});

describe("AUTH_SECRET", () => {
	it("refuses the public development value in production, and only there", () => {
		expect(exampleEnv().AUTH_SECRET).toBe(DEVELOPMENT_AUTH_SECRET);
		expect(problemsOf({ ...exampleEnv(), NODE_ENV: "production" })).toEqual([
			expect.stringMatching(/^AUTH_SECRET: is the public development value/),
		]);
		expect(() => parseConfig(productionEnv())).not.toThrow();
	});
});
