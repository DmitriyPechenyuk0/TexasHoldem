import { sql } from "drizzle-orm";
import {
	DATABASE,
	type Database,
} from "@/shared/infrastructure/database/index.js";
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
