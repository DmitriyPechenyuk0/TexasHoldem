import {
	Global,
	Inject,
	Module,
	type OnApplicationShutdown,
} from "@nestjs/common";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { AppConfig } from "../config/index.js";
import { DATABASE } from "./database.js";

const POOL = Symbol("Pool");

@Global()
@Module({
	providers: [
		{
			provide: POOL,
			inject: [AppConfig],
			useFactory: (config: AppConfig) =>
				new Pool({ connectionString: config.database.url }),
		},
		{
			provide: DATABASE,
			inject: [POOL],
			useFactory: (pool: Pool) => drizzle({ client: pool }),
		},
	],
	exports: [DATABASE],
})
export class DatabaseModule implements OnApplicationShutdown {
	constructor(@Inject(POOL) private readonly pool: Pool) {}

	/** Closes idle connections so the process can exit; `app.close()` and shutdown hooks both get here. */
	async onApplicationShutdown(): Promise<void> {
		await this.pool.end();
	}
}
