import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		// The README examples import the package by name; run them against the sources.
		alias: {
			"@holdem/engine": fileURLToPath(
				new URL("./src/index.ts", import.meta.url),
			),
		},
	},
	test: {
		globals: true,
		include: ["src/**/*.spec.ts"],
		tags: [
			{
				name: "slow",
				description:
					"Statistical checks that take seconds; skip with --tags-filter='!slow'.",
			},
		],
		coverage: {
			provider: "v8",
			reporter: ["text", "html", "lcov"],
			// Every source file counts, including ones no test imports.
			include: ["src/**/*.ts"],
			exclude: ["src/**/*.spec.ts"],
			// The rules engine is the core of the product: every line and branch is tested.
			thresholds: { 100: true },
		},
	},
});
