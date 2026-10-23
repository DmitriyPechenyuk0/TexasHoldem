import { AsyncResource } from "node:async_hooks";
import {
	Global,
	Inject,
	Logger,
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

/** Shown in pg_stat_activity, so the api's connections can be told apart. */
export const APPLICATION_NAME = "holdem-api";

function createPool(config: AppConfig): Pool {
	const pool = new Pool({
		connectionString: config.database.url,
		connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
		application_name: APPLICATION_NAME,
	});
	// When the server drops an idle connection (restart, failover, pg_terminate_backend), the pool
	// emits `error`; without a listener that crashes the process. The pool discards the connection
	// and opens a new one for the next query. The listener is bound to this context: otherwise the
	// line would carry the requestId of whichever request happened to open the connection.
	const logger = new Logger("Database");
	pool.on(
		"error",
		AsyncResource.bind((error: Error) => {
			logger.warn(`Idle database connection lost: ${error.message}`);
		}),
	);
	return pool;
}

@Global()
@Module({
	providers: [
		{
			provide: POOL,
			inject: [AppConfig],
			useFactory: createPool,
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
