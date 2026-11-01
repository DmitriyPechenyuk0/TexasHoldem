import {
	InMemoryLobbyTables,
	privateTable,
} from "../../commands/in-memory-lobby.js";
import { ResolveInviteHandler } from "./resolve-invite.handler.js";
import { ResolveInviteQuery } from "./resolve-invite.query.js";

describe("ResolveInviteHandler", () => {
	it("shows the table an invite leads to, and whether it asks for a password", async () => {
		const handler = new ResolveInviteHandler(
			new InMemoryLobbyTables(
				privateTable(),
				privateTable({ id: "t-2", inviteCode: "ABCDEFGH", passwordHash: "x" }),
			),
		);

		expect(await handler.execute(new ResolveInviteQuery("K7MPQ2XZ"))).toEqual({
			tableId: "t-1",
			name: "Friday game",
			smallBlind: 5,
			bigBlind: 10,
			maxSeats: 6,
			passwordRequired: false,
		});
		expect(
			(await handler.execute(new ResolveInviteQuery("ABCDEFGH")))
				.passwordRequired,
		).toBe(true);
		await expect(
			handler.execute(new ResolveInviteQuery("ZZZZZZZZ")),
		).rejects.toMatchObject({ code: "lobby.invite-not-found" });
	});
});
