import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		include: ["src/**/*.spec.ts"],
		coverage: {
			provider: "v8",
			reporter: ["text", "html", "lcov"],
			// Every source file counts, including ones no test imports.
			include: ["src/**/*.ts"],
			exclude: ["src/**/*.spec.ts"],
			// Starting baseline for the contracts. Raise it as coverage grows.
			thresholds: { lines: 90, statements: 90, functions: 90, branches: 90 },
		},
	},
});
