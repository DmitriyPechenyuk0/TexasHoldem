import type { INestApplication } from "@nestjs/common";
import { EventsHandler, type IEvent, type IEventHandler } from "@nestjs/cqrs";
import { sql } from "drizzle-orm";
import type { App } from "supertest/types.js";
import { z } from "zod";
import {
	IntegrationEvent,
	IntegrationEventBus,
} from "@/shared/application/integration-events.js";
import {
	DATABASE,
	type Database,
	inTransaction,
} from "@/shared/infrastructure/database/index.js";
import { createTestApp } from "./support/create-test-app.js";
import {
	createTestDatabase,
	type TestDatabase,
} from "./support/test-database.js";

@IntegrationEvent({
	name: "test.pinged",
	version: 1,
	schema: z.object({ id: z.string() }),
	broadcast: true,
})
class Pinged implements IEvent {
	constructor(readonly id: string) {}
}

@IntegrationEvent({
	name: "test.noted",
	version: 1,
	schema: z.object({ id: z.string() }),
	broadcast: false,
})
class Noted implements IEvent {
	constructor(readonly id: string) {}
}

/** What each instance handled; both run in this process, so each handler knows its own app. */
@EventsHandler(Pinged, Noted)
class Received implements IEventHandler<Pinged | Noted> {
	readonly ids: string[] = [];

	handle({ id }: Pinged | Noted): void {
		this.ids.push(id);
	}
}

/** Two api instances on one database and one Redis (POK-74). */
describe("Integration events across instances (e2e)", () => {
	let database: TestDatabase;
	const apps: INestApplication<App>[] = [];

	beforeAll(async () => {
		database = await createTestDatabase();
		for (let instance = 0; instance < 2; instance++) {
			apps.push(
				await createTestApp({
					config: { database: { url: database.url } },
					providers: [Received],
				}),
			);
		}
	});

	afterAll(async () => {
		await Promise.all(apps.map((app) => app.close()));
		await database?.drop();
	});

	const received = (instance: number) => apps[instance]!.get(Received).ids;
	const bus = (instance: number) => apps[instance]!.get(IntegrationEventBus);

	it("handles a broadcast event on every instance, and any other only where it was published", async () => {
		bus(0).publish(new Noted("local"), new Pinged("everywhere"));

		await vi.waitFor(() => expect(received(1)).toEqual(["everywhere"]));
		expect(received(0)).toEqual(["local", "everywhere"]);
	});

	it("publishes once the transaction has committed, and nothing when it rolls back", async () => {
		const db = apps[0]!.get<Database>(DATABASE);
		const before = received(1).length;

		await expect(
			inTransaction(db, async (tx) => {
				await tx.execute(sql`select 1`);
				bus(0).publish(new Pinged("rolled-back"));
				throw new Error("roll back");
			}),
		).rejects.toThrow("roll back");
		await inTransaction(db, async (tx) => {
			await tx.execute(sql`select 1`);
			bus(0).publish(new Pinged("committed"));
		});

		// Redis keeps the order of one publisher's messages: the committed one comes last.
		await vi.waitFor(() =>
			expect(received(1).slice(before)).toEqual(["committed"]),
		);
		expect(received(0)).not.toContain("rolled-back");
	});
});
