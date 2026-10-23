import type { AppConfig } from "./app-config.js";
import { ENV_PAIRS, envSchema } from "./env.schema.js";

type EnvSource = Readonly<Record<string, string | undefined>>;

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

/** Validates an environment record. Empty values count as unset. Throws `ConfigError` listing every problem. */
export function parseConfig(source: EnvSource): AppConfig {
	const env = Object.fromEntries(
		Object.entries(source).filter(
			([, value]) => value !== undefined && value !== "",
		),
	);

	const result = envSchema.safeParse(env, {
		error: (issue) => (issue.input === undefined ? "is required" : undefined),
	});
	const problems = [
		...(result.error?.issues.map(
			(issue) => `${issue.path.join(".")}: ${issue.message}`,
		) ?? []),
		...ENV_PAIRS.flatMap(([first, second]) =>
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

/** The only place that reads `process.env`. */
export function loadConfig(): AppConfig {
	return parseConfig(process.env);
}
