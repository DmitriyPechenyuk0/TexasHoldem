import { defineConfig } from "drizzle-kit";
// Not the config barrel, which also pulls in the Nest module and its decorators.
import { loadDatabaseConfig } from "./src/shared/infrastructure/config/load-config.js";

// drizzle-kit reads .env itself; real environment variables still take precedence.
export default defineConfig({
	dialect: "postgresql",
	// Each context owns its tables in one schema file; this glob is the aggregation.
	schema: "./src/modules/*/infrastructure/persistence/schema.ts",
	out: "./migrations",
	dbCredentials: loadDatabaseConfig(),
});
