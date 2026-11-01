import { TABLE_INVITE_TTL_SECONDS } from "@holdem/shared/contracts/social";
import type { EventBus, QueryBus } from "@nestjs/cqrs";
import type { Clock } from "@/shared/application/clock.js";
import type { InvitableTable } from "@/shared/application/table-invitations.js";
import { TableInviteSent } from "../../events/table-invite-sent.event.js";
import { InMemoryFriendships, NOW } from "../../in-memory-friendships.js";
import { InMemoryTableInvites } from "../../in-memory-table-invites.js";
import { InviteFriendToTableCommand } from "./invite-friend-to-table.command.js";
import {
	InviteFriendToTableHandler,
	TABLE_INVITE_TTL_MS,
} from "./invite-friend-to-table.handler.js";

const table: InvitableTable = {
	tableId: "t-1",
	name: "Friday game",
	presetId: "low",
	smallBlind: 5,
	bigBlind: 10,
	maxSeats: 6,
	playerCount: 1,
	handsPlayed: 0,
	visibility: "private",
};

async function setUp() {
	const friendships = new InMemoryFriendships();
	await friendships.befriend("u-1", "u-2", new Date(0));
	const invites = new InMemoryTableInvites();
	const published: unknown[] = [];
	const handler = new InviteFriendToTableHandler(
		friendships,
		invites,
		{
			execute: async ({ tableId }: { tableId: string }) =>
				tableId === "t-1" ? table : null,
		} as unknown as QueryBus,
		{
			publish: (event: unknown) => published.push(event),
		} as unknown as EventBus,
		{ now: () => NOW } as Clock,
	);
	return { invites, published, handler };
}

describe("InviteFriendToTableHandler", () => {
	it("keeps the invite for ten minutes, and tells the friend", async () => {
		const { invites, published, handler } = await setUp();

		await handler.execute(new InviteFriendToTableCommand("u-1", "u-2", "t-1"));

		const expiresAt = new Date(NOW.getTime() + TABLE_INVITE_TTL_MS);
		expect(await invites.pending("u-2", NOW)).toEqual([
			{ inviterId: "u-1", tableId: "t-1", expiresAt },
		]);
		expect(published).toEqual([
			new TableInviteSent("u-2", "u-1", table, expiresAt),
		]);
		expect(TABLE_INVITE_TTL_MS).toBe(TABLE_INVITE_TTL_SECONDS * 1000);
	});

	it("invites only friends, to a table the player may join", async () => {
		const { published, handler } = await setUp();

		await expect(
			handler.execute(new InviteFriendToTableCommand("u-1", "u-3", "t-1")),
		).rejects.toMatchObject({ code: "social.not-friends" });
		await expect(
			handler.execute(new InviteFriendToTableCommand("u-1", "u-2", "t-2")),
		).rejects.toMatchObject({ code: "social.table-not-found" });
		expect(published).toEqual([]);
	});
});
