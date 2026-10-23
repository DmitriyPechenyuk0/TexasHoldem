import type { INestApplication, ModuleMetadata } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { App } from "supertest/types.js";
import { AppModule } from "@/app.module.js";
import type { AppConfig } from "@/shared/infrastructure/config/index.js";
import { exampleConfig } from "./example-config.js";

export interface TestAppOptions extends Pick<
	ModuleMetadata,
	"controllers" | "providers"
> {
	/** Overrides on top of `.env.example`, e.g. `{ database: { url: testDatabase.url } }`. */
	readonly config?: Partial<AppConfig>;
}

/** Boots the real application with `.env.example` config, plus any test-only controllers or providers. */
export async function createTestApp({
	config,
	...extra
}: TestAppOptions = {}): Promise<INestApplication<App>> {
	const moduleRef = await Test.createTestingModule({
		// exampleConfig() returns a fresh object, so overriding it in place is safe.
		imports: [AppModule.forRoot(Object.assign(exampleConfig(), config))],
		...extra,
	}).compile();

	const app = moduleRef.createNestApplication<INestApplication<App>>();
	await app.init();
	return app;
}
