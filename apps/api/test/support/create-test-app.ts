import type { INestApplication, ModuleMetadata } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { App } from "supertest/types.js";
import { AppModule } from "@/app.module.js";
import { exampleConfig } from "./example-config.js";

/** Boots the real application with `.env.example` config, plus any test-only controllers or providers. */
export async function createTestApp(
	extra: Pick<ModuleMetadata, "controllers" | "providers"> = {},
): Promise<INestApplication<App>> {
	const moduleRef = await Test.createTestingModule({
		imports: [AppModule.forRoot(exampleConfig())],
		...extra,
	}).compile();

	const app = moduleRef.createNestApplication<INestApplication<App>>();
	await app.init();
	return app;
}
