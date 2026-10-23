import {
	Global,
	Inject,
	Module,
	type OnApplicationShutdown,
} from "@nestjs/common";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { AppConfig } from "../config/index.js";
import { DatabaseHealthIndicator } from "./database-health.indicator.js";
import { DATABASE } from "./database.js";

const POOL = Symbol("Pool");

// Without it, pg waits forever for a connection to an unreachable host.
const CONNECTION_TIMEOUT_MS = 5_000;

@Global()
@Module({
	providers: [
		{
			provide: POOL,
			inject: [AppConfig],
			useFactory: (config: AppConfig) =>
				new Pool({
					connectionString: config.database.url,
					connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
				}),
		},
		{
			provide: DATABASE,
			inject: [POOL],
			useFactory: (pool: Pool) => drizzle({ client: pool }),
		},
		DatabaseHealthIndicator,
	],
	exports: [DATABASE, DatabaseHealthIndicator],
})
export class DatabaseModule implements OnApplicationShutdown {
	constructor(@Inject(POOL) private readonly pool: Pool) {}

	/** Closes idle connections so the process can exit; `app.close()` and shutdown hooks both get here. */
	async onApplicationShutdown(): Promise<void> {
		await this.pool.end();
	}
}
