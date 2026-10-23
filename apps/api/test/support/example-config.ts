import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import {
	type AppConfig,
	parseConfig,
} from "@/shared/infrastructure/config/index.js";

export const exampleEnv = (): Record<string, string> =>
	parseEnv(
		readFileSync(new URL("../../.env.example", import.meta.url), "utf8"),
	) as Record<string, string>;

/** Configuration built from `.env.example`, so tests never depend on a developer's `.env`. */
export const exampleConfig = (): AppConfig => parseConfig(exampleEnv());
