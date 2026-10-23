import type { z } from "zod";

type EnvSource = Readonly<Record<string, string | undefined>>;

export class EnvError extends Error {
	constructor(readonly problems: readonly string[]) {
		super(
			[
				"Invalid environment configuration:",
				...problems.map((problem) => `  - ${problem}`),
				"Every variable is documented in apps/web/.env.example.",
			].join("\n"),
		);
		this.name = "EnvError";
	}
}

/** Parses environment values with `schema`. Empty values count as unset. Throws `EnvError` listing every problem. */
export function validateEnv<Schema extends z.ZodType>(
	schema: Schema,
	source: EnvSource,
): z.output<Schema> {
	const env = Object.fromEntries(
		Object.entries(source).filter(
			([, value]) => value !== undefined && value !== "",
		),
	);

	const result = schema.safeParse(env, {
		error: (issue) => (issue.input === undefined ? "is required" : undefined),
	});
	if (result.success) {
		return result.data;
	}
	throw new EnvError(
		result.error.issues
			.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
			.sort(),
	);
}
