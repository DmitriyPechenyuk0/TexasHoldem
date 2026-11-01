import type { QueryBus } from "@nestjs/cqrs";
import type { Clock } from "@/shared/application/clock.js";
import { GetPlayerCardsQuery } from "@/shared/application/player-directory.js";
import { NOW } from "../../in-memory-friendships.js";
import { InMemoryTableInvites } from "../../in-memory-table-invites.js";
import { GetTableInvitesHandler } from "./get-table-invites.handler.js";
import { GetTableInvitesQuery } from "./get-table-invites.query.js";

const alice = {
	userId: "u-1",
	username: "alice",
	nickname: "Alice",
	avatarUrl: null,
};

describe("GetTableInvitesHandler", () => {
	it("shows the invites waiting, newest first, without those the sender can no longer make", async () => {
		const invites = new InMemoryTableInvites();
		const later = (ms: number) => new Date(NOW.getTime() + ms);
		await invites.add("u-2", "u-1", "t-1", later(1_000));
		await invites.add("u-2", "u-1", "t-2", later(2_000));
		await invites.add("u-2", "u-1", "closed", later(3_000));
		await invites.add("u-2", "u-9", "t-1", later(4_000));
		await invites.add("u-2", "u-1", "old", NOW);
		const queryBus = {
			execute: async (query: { tableId?: string }) =>
				query instanceof GetPlayerCardsQuery
					? [alice]
					: query.tableId === "closed"
						? null
						: { tableId: query.tableId },
		} as unknown as QueryBus;
		const handler = new GetTableInvitesHandler(invites, queryBus, {
			now: () => NOW,
		} as Clock);

		expect(await handler.execute(new GetTableInvitesQuery("u-2"))).toEqual([
			{ from: alice, table: { tableId: "t-2" }, expiresAt: later(2_000) },
			{ from: alice, table: { tableId: "t-1" }, expiresAt: later(1_000) },
		]);
	});
});
