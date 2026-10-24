import { defineConfig } from "vitest/config";

export default defineConfig({
	// Resolves the `@/` alias declared in tsconfig.json. Requires Vite 8, which ships this option.
	resolve: { tsconfigPaths: true },
	test: {
		globals: true,
		projects: [
			// Fast and self-contained: `pnpm test`.
			{ extends: true, test: { name: "unit", include: ["**/*.spec.ts"] } },
			// The real app against Postgres and Redis from `pnpm infra:up`: `pnpm test:e2e`.
			{ extends: true, test: { name: "e2e", include: ["**/*.e2e-spec.ts"] } },
		],
		// `pnpm test:coverage` runs both projects: e2e tests are what cover modules, controllers and adapters.
		coverage: {
			provider: "v8",
			reporter: ["text", "html", "lcov"],
			include: ["src/**/*.ts"],
			exclude: ["src/**/*.spec.ts", "src/main.ts"],
			// Starting baseline, a little under the measured coverage. Raise it as coverage grows.
			thresholds: { lines: 98, statements: 98, functions: 97, branches: 90 },
		},
	},
});
