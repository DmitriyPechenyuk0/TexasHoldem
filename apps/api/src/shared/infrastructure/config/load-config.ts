import type { z } from "zod";
import type { AppConfig } from "./app-config.js";
import { databaseEnvSchema, ENV_PAIRS, envSchema } from "./env.schema.js";

type EnvSource = Readonly<Record<string, string | undefined>>;
type EnvPairs = readonly (readonly [string, string])[];

export class ConfigError extends Error {
	constructor(readonly problems: readonly string[]) {
		super(
			[
				"Invalid environment configuration:",
				...problems.map((problem) => `  - ${problem}`),
				"Every variable is documented in apps/api/.env.example.",
			].join("\n"),
		);
		this.name = "ConfigError";
	}
}

/** Empty values count as unset. Throws `ConfigError` listing every problem. */
function validate<Output>(
	schema: z.ZodType<Output>,
	source: EnvSource,
	pairs: EnvPairs = [],
): Output {
	const env = Object.fromEntries(
		Object.entries(source).filter(
			([, value]) => value !== undefined && value !== "",
		),
	);

	const result = schema.safeParse(env, {
		error: (issue) => (issue.input === undefined ? "is required" : undefined),
	});
	const problems = [
		...(result.error?.issues.map(
			(issue) => `${issue.path.join(".")}: ${issue.message}`,
		) ?? []),
		...pairs.flatMap(([first, second]) =>
			first in env && !(second in env)
				? [`${second}: is required when ${first} is set`]
				: second in env && !(first in env)
					? [`${first}: is required when ${second} is set`]
					: [],
		),
	].sort();

	if (!result.success || problems.length > 0) {
		throw new ConfigError(problems);
	}
	return result.data;
}

export function parseConfig(source: EnvSource): AppConfig {
	return validate(envSchema, source, ENV_PAIRS);
}

export function parseDatabaseConfig(source: EnvSource): AppConfig["database"] {
	return validate(databaseEnvSchema, source);
}

// The only two functions that read `process.env`.

export function loadConfig(): AppConfig {
	return parseConfig(process.env);
}

/** For tools outside the app (drizzle-kit) that need the database and nothing else. */
export function loadDatabaseConfig(): AppConfig["database"] {
	return parseDatabaseConfig(process.env);
}
