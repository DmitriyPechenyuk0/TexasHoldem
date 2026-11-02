import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		include: ["src/**/*.spec.ts"],
		coverage: {
			provider: "v8",
			reporter: ["text"],
			// The pure parts only: the rest drives processes and sockets, and runs as the load test.
			include: ["src/stats.ts", "src/strategy.ts", "src/options.ts"],
			thresholds: {
				lines: 100,
				statements: 100,
				functions: 100,
				branches: 100,
			},
		},
	},
});
