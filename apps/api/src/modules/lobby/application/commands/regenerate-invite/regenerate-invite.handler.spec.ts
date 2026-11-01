import { InMemoryLobbyTables, privateTable } from "../in-memory-lobby.js";
import { RegenerateInviteCommand } from "./regenerate-invite.command.js";
import { RegenerateInviteHandler } from "./regenerate-invite.handler.js";

describe("RegenerateInviteHandler", () => {
	it("gives the creator's private table a new code, and the old one leads nowhere", async () => {
		const tables = new InMemoryLobbyTables(privateTable());
		const handler = new RegenerateInviteHandler(tables);

		const code = await handler.execute(
			new RegenerateInviteCommand("t-1", "u-1"),
		);

		expect(code).not.toBe("K7MPQ2XZ");
		expect(await tables.findOpenByInviteCode("K7MPQ2XZ")).toBeNull();
		expect((await tables.findOpenByInviteCode(code))?.id).toBe("t-1");
	});

	it("draws again when a code is taken, and gives up after a few", async () => {
		const tables = new InMemoryLobbyTables(privateTable());
		const handler = new RegenerateInviteHandler(tables);
		const setInviteCode = vi.spyOn(tables, "setInviteCode");
		setInviteCode.mockResolvedValueOnce(false);

		await expect(
			handler.execute(new RegenerateInviteCommand("t-1", "u-1")),
		).resolves.toBeDefined();
		setInviteCode.mockResolvedValue(false);
		await expect(
			handler.execute(new RegenerateInviteCommand("t-1", "u-1")),
		).rejects.toThrow("No free invite code");
	});

	it("is the creator's alone, for an open private table", async () => {
		const tables = new InMemoryLobbyTables(
			privateTable(),
			privateTable({ id: "t-2", visibility: "public", inviteCode: null }),
			privateTable({ id: "t-3", status: "closed", inviteCode: "ABCDEFGH" }),
		);
		const handler = new RegenerateInviteHandler(tables);
		const codeOf = (tableId: string, userId: string) =>
			handler
				.execute(new RegenerateInviteCommand(tableId, userId))
				.catch((error: { code: string }) => error.code);

		expect(await codeOf("t-1", "u-2")).toBe("lobby.not-creator");
		expect(await codeOf("t-2", "u-1")).toBe("lobby.not-private");
		expect(await codeOf("t-3", "u-1")).toBe("lobby.table-not-found");
		expect(await codeOf("nope", "u-1")).toBe("lobby.table-not-found");
	});
});
