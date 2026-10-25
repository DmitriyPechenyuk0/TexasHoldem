import { sql } from "drizzle-orm";
import request from "supertest";
import {
	DATABASE,
	type Database,
} from "@/shared/infrastructure/database/index.js";
import { APPLICATION_NAME } from "@/shared/infrastructure/database/database.module.js";
import { captureLogs } from "./support/capture-logs.js";
import { createTestApp } from "./support/create-test-app.js";
import {
	createTestDatabase,
	type TestDatabase,
} from "./support/test-database.js";

const currentDatabase = async (db: Database): Promise<string | undefined> => {
	const [row] = await db.execute<{ name: string }>(
		sql`select current_database() as name`,
		"objects",
	);
	return row?.name;
};

describe("Database (e2e)", () => {
	let first: TestDatabase;
	let second: TestDatabase;

	beforeAll(async () => {
		[first, second] = await Promise.all([
			createTestDatabase(),
			createTestDatabase(),
		]);
	});

	afterAll(async () => {
		await Promise.all([first?.drop(), second?.drop()]);
	});

	it("creates a fresh database with the migrations applied", async () => {
		expect(await currentDatabase(first.db)).toBe(first.name);

		const rows = await first.db.execute(
			sql`select to_regclass('drizzle.__drizzle_migrations')::text as journal`,
			"objects",
		);
		expect(rows).toEqual([{ journal: "drizzle.__drizzle_migrations" }]);
	});

	it("isolates test databases from each other", async () => {
		await first.db.execute(sql`create table isolation_probe (id int)`);

		const lookup = sql`select to_regclass('public.isolation_probe')::text as probe`;
		expect(await first.db.execute(lookup, "objects")).toEqual([
			{ probe: "isolation_probe" },
		]);
		expect(await second.db.execute(lookup, "objects")).toEqual([
			{ probe: null },
		]);
	});

	it("gives the app a client for the configured database and closes it on shutdown", async () => {
		const app = await createTestApp({
			config: { database: { url: second.url } },
		});

		const db = app.get<Database>(DATABASE);
		expect(await currentDatabase(db)).toBe(second.name);

		await app.close();
		// Drizzle wraps the driver error; pg's own message says the pool was ended.
		await expect(currentDatabase(db)).rejects.toMatchObject({
			cause: {
				message: expect.stringMatching(/after calling end on the pool/),
			},
		});
	});

	it("survives the server dropping an idle connection, as on a Postgres restart", async () => {
		const { lines } = captureLogs();
		const app = await createTestApp({
			config: { database: { url: second.url } },
		});
		const db = app.get<Database>(DATABASE);
		// Open the pooled connection inside an HTTP request, as production does. Only the database
		// check matters here: Redis may still be connecting, which would turn the status into 503.
		const readiness = await request(app.getHttpServer()).get(
			"/api/health/ready",
		);
		expect(readiness.body.checks.database).toBe("up");

		const terminated = await first.db.execute<{ count: number }>(
			sql`select count(pg_terminate_backend(pid))::int as count from pg_stat_activity
				where datname = ${second.name} and application_name = ${APPLICATION_NAME}`,
			"objects",
		);
		expect(terminated).toEqual([{ count: 1 }]);

		const deadline = Date.now() + 5_000;
		while (
			!lines.some((line) =>
				String(line.msg).startsWith("Idle database connection lost"),
			) &&
			Date.now() < deadline
		) {
			await new Promise((resolve) => setTimeout(resolve, 20));
		}
		const warning = lines.find((line) => line.context === "Database");
		expect(warning).toMatchObject({ level: "warn" });
		// The loss belongs to no request, even though a request opened the connection.
		expect(warning).not.toHaveProperty("requestId");
		// The pool opens a fresh connection for the next query.
		expect(await currentDatabase(db)).toBe(second.name);
		await app.close();
	});

	it("drops the database", async () => {
		const scratch = await createTestDatabase();
		await scratch.drop();

		const rows = await first.db.execute(
			sql`select count(*)::int as count from pg_database where datname = ${scratch.name}`,
			"objects",
		);
		expect(rows).toEqual([{ count: 0 }]);
	});
});
