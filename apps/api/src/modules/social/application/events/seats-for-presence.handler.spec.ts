import { Logger } from "@nestjs/common";
import type { EventBus } from "@nestjs/cqrs";
import { TableSummaryChanged } from "@/modules/table/index.js";
import { InMemoryPresence } from "../in-memory-presence.js";
import { PresenceChanged } from "./presence-changed.event.js";
import { SeatsForPresenceHandler } from "./seats-for-presence.handler.js";

const summary = (status: "open" | "closed", ...userIds: string[]) =>
	new TableSummaryChanged(
		"t-1",
		status,
		userIds.map((userId, seat) => ({ seat, userId })),
		0,
	);

function setUp() {
	const presence = new InMemoryPresence();
	const published: unknown[] = [];
	const eventBus = {
		publish: (event: unknown) => published.push(event),
	} as unknown as EventBus;
	return {
		presence,
		published,
		handler: new SeatsForPresenceHandler(presence, eventBus),
	};
}

describe("SeatsForPresenceHandler", () => {
	it("keeps who sits where, and tells of players online who sat down or left", async () => {
		const { presence, published, handler } = setUp();
		presence.online.add("u-1");

		await handler.handle(summary("open", "u-1", "u-2"));
		expect(published).toEqual([new PresenceChanged("u-1")]);
		expect((await presence.whereabouts(["u-2"])).get("u-2")?.tables).toEqual([
			"t-1",
		]);

		await handler.handle(summary("open", "u-1", "u-2"));
		expect(published).toHaveLength(1);

		await handler.handle(summary("closed", "u-1", "u-2"));
		expect(published).toEqual([
			new PresenceChanged("u-1"),
			new PresenceChanged("u-1"),
		]);
		expect((await presence.whereabouts(["u-1"])).get("u-1")?.tables).toEqual(
			[],
		);
	});

	it("warns when it cannot keep the seats", async () => {
		const warn = vi
			.spyOn(Logger.prototype, "warn")
			.mockImplementation(() => {});
		const { presence, handler } = setUp();
		vi.spyOn(presence, "seat").mockRejectedValueOnce(new Error("down"));

		await handler.handle(summary("open", "u-1"));

		expect(warn).toHaveBeenCalledWith(
			expect.objectContaining({ msg: "seats not kept for presence" }),
		);
		vi.restoreAllMocks();
	});
});
