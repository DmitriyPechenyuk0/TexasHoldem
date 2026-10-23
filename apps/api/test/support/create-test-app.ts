import type { INestApplication, ModuleMetadata } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { App } from "supertest/types.js";
import { AppModule } from "@/app.module.js";
import { configureApp } from "@/configure-app.js";
import type { AppConfig } from "@/shared/infrastructure/config/index.js";
import { LOG_DESTINATION } from "@/shared/infrastructure/logging/index.js";
import { testLogDestination } from "./capture-logs.js";
import { exampleConfig } from "./example-config.js";

export interface TestAppOptions extends Pick<
	ModuleMetadata,
	"controllers" | "providers"
> {
	/** Overrides on top of `.env.example`, e.g. `{ database: { url: testDatabase.url } }`. */
	readonly config?: Partial<AppConfig>;
}

/**
 * Boots the real application with `.env.example` config, plus any test-only controllers or
 * providers. Its logs go to `testLogDestination`; read them with `captureLogs()`.
 */
export async function createTestApp({
	config,
	...extra
}: TestAppOptions = {}): Promise<INestApplication<App>> {
	const log: AppConfig["log"] = { level: "debug", pretty: false };
	// exampleConfig() returns a fresh object, so overriding it in place is safe.
	const appConfig = Object.assign(exampleConfig(), { log }, config);
	const moduleRef = await Test.createTestingModule({
		imports: [AppModule.forRoot(appConfig)],
		...extra,
	})
		.overrideProvider(LOG_DESTINATION)
		.useValue(testLogDestination)
		.compile();

	const app = moduleRef.createNestApplication<INestApplication<App>>({
		bufferLogs: true,
	});
	configureApp(app, appConfig);
	await app.init();
	return app;
}
