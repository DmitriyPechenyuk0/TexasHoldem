import type { QueryBus } from "@nestjs/cqrs";
import { FindAccountsQuery } from "@/shared/application/accounts.js";
import { ListOpenTablesQuery } from "@/shared/application/open-tables.js";
import { GetPlayerCardsQuery } from "@/shared/application/player-directory.js";
import { ListActiveTablesHandler } from "./queries/list-active-tables/list-active-tables.handler.js";
import { LookUpUsersHandler } from "./queries/look-up-users/look-up-users.handler.js";
import { LookUpUsersQuery } from "./queries/look-up-users/look-up-users.query.js";

const alice = {
	userId: "u-1",
	username: "alice",
	nickname: "Alice",
	avatarUrl: null,
};
const table = {
	tableId: "t-1",
	name: "Friday game",
	visibility: "private" as const,
	presetId: "low",
	smallBlind: 5,
	bigBlind: 10,
	maxSeats: 6,
	creatorId: "u-1",
	players: [
		{ seat: 0, userId: "u-1" },
		{ seat: 3, userId: "ghost" },
	],
	handsPlayed: 2,
	createdAt: new Date(0),
};

/** A bus that answers each shared-kernel query the admin asks. */
const busAnswering = () =>
	({
		execute: async (query: unknown) => {
			if (query instanceof GetPlayerCardsQuery) return [alice];
			if (query instanceof ListOpenTablesQuery)
				return query.playerId === "u-2" ? [] : [table];
			if (query instanceof FindAccountsQuery)
				return [
					{
						userId: "u-1",
						username: "alice",
						email: "a@x",
						emailVerified: true,
						role: "admin",
						createdAt: new Date(0),
					},
					{
						userId: "u-2",
						username: null,
						email: "b@x",
						emailVerified: false,
						role: "user",
						createdAt: new Date(0),
					},
				];
			throw new Error("unexpected query");
		},
	}) as unknown as QueryBus;

describe("admin queries", () => {
	it("show each open table with the cards of its creator and players, when they have one", async () => {
		const [listed] = await new ListActiveTablesHandler(
			busAnswering(),
		).execute();

		expect(listed).toMatchObject({
			tableId: "t-1",
			creator: alice,
			seats: [
				{ seat: 0, userId: "u-1", player: alice },
				{ seat: 3, userId: "ghost", player: null },
			],
		});
	});

	it("show accounts with their nickname, if any, and the tables they sit at", async () => {
		const users = await new LookUpUsersHandler(busAnswering()).execute(
			new LookUpUsersQuery("a"),
		);

		expect(users).toEqual([
			expect.objectContaining({
				userId: "u-1",
				nickname: "Alice",
				tables: [{ tableId: "t-1", name: "Friday game", seat: 0 }],
			}),
			expect.objectContaining({ userId: "u-2", nickname: null, tables: [] }),
		]);
	});
});
