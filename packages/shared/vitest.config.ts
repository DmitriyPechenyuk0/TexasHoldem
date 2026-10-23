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
			// Just under the current 100%: a contract that no test imports fails the gate.
			thresholds: { lines: 95, statements: 95, functions: 95, branches: 95 },
		},
	},
});
