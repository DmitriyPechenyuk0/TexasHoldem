import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import type { Database } from "@/shared/infrastructure/database/index.js";
import { exampleConfig } from "./example-config.js";

const MIGRATIONS = fileURLToPath(new URL("../../migrations", import.meta.url));

export interface TestDatabase {
	readonly name: string;
	readonly url: string;
	readonly db: Database;
	/** Closes the connections and drops the database. */
	drop(): Promise<void>;
}

/** The same server as `.env.example`, reached through holdem_test, which docker compose and CI create. */
const urlOf = (database: string): string => {
	const url = new URL(exampleConfig().database.url);
	url.pathname = `/${database}`;
	return url.toString();
};

async function onServer(statement: string): Promise<void> {
	const client = new pg.Client({ connectionString: urlOf("holdem_test") });
	await client.connect();
	try {
		await client.query(statement);
	} finally {
		await client.end();
	}
}

/**
 * A new database with every migration applied, so each test file runs against a clean schema
 * that no other file or parallel run can touch. Requires the services from `pnpm infra:up`.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
	const name = `holdem_test_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
	await onServer(`CREATE DATABASE "${name}"`);

	const url = urlOf(name);
	const pool = new pg.Pool({ connectionString: url });
	const drop = async () => {
		await pool.end();
		await onServer(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
	};

	const db = drizzle({ client: pool });
	try {
		await migrate(db, { migrationsFolder: MIGRATIONS });
	} catch (error) {
		await drop();
		throw error;
	}
	return { name, url, db, drop };
}
