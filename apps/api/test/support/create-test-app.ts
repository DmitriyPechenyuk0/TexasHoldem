import type { INestApplication, ModuleMetadata } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Logger } from "nestjs-pino";
import type { DestinationStream } from "pino";
import type { App } from "supertest/types.js";
import { AppModule } from "@/app.module.js";
import type { AppConfig } from "@/shared/infrastructure/config/index.js";
import { LOG_DESTINATION } from "@/shared/infrastructure/logging/index.js";
import { exampleConfig } from "./example-config.js";

export interface TestAppOptions extends Pick<
	ModuleMetadata,
	"controllers" | "providers"
> {
	/** Overrides on top of `.env.example`, e.g. `{ database: { url: testDatabase.url } }`. */
	readonly config?: Partial<AppConfig>;
	/** Receives the app's JSON log lines at debug level. Without it the app logs nothing. */
	readonly logs?: DestinationStream;
}

/** Boots the real application with `.env.example` config, plus any test-only controllers or providers. */
export async function createTestApp({
	config,
	logs,
	...extra
}: TestAppOptions = {}): Promise<INestApplication<App>> {
	const log: AppConfig["log"] = logs
		? { level: "debug", pretty: false }
		: { level: "silent", pretty: false };
	const builder = Test.createTestingModule({
		// exampleConfig() returns a fresh object, so overriding it in place is safe.
		imports: [
			AppModule.forRoot(Object.assign(exampleConfig(), { log }, config)),
		],
		...extra,
	});
	if (logs) {
		builder.overrideProvider(LOG_DESTINATION).useValue(logs);
	}
	const moduleRef = await builder.compile();

	const app = moduleRef.createNestApplication<INestApplication<App>>({
		bufferLogs: true,
	});
	app.useLogger(app.get(Logger));
	await app.init();
	return app;
}
