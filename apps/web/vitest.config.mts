import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
	},
	test: {
		globals: true,
		include: ["src/**/*.spec.ts"],
		// `@/shared/config` validates these on import, as it does in the app.
		env: {
			NEXT_PUBLIC_API_URL: "http://api.test",
			API_URL: "http://api.test",
		},
		coverage: {
			provider: "v8",
			reporter: ["text", "html", "lcov"],
			include: ["src/**/*.ts"],
			exclude: ["src/**/*.spec.ts", "src/**/*.d.json.ts"],
		},
	},
});
