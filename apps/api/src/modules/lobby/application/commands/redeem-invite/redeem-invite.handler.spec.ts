import {
	InMemoryLobbyTables,
	InMemoryTableGrants,
	PlainPasswordHasher,
	privateTable,
} from "../in-memory-lobby.js";
import { RedeemInviteCommand } from "./redeem-invite.command.js";
import { RedeemInviteHandler } from "./redeem-invite.handler.js";

function setUp(passwordHash: string | null = null) {
	const grants = new InMemoryTableGrants();
	const tables = new InMemoryLobbyTables(privateTable({ passwordHash }));
	return {
		grants,
		tables,
		handler: new RedeemInviteHandler(tables, new PlainPasswordHasher(), grants),
	};
}

describe("RedeemInviteHandler", () => {
	it("grants access to the table the invite leads to", async () => {
		const { grants, handler } = setUp();

		await expect(
			handler.execute(new RedeemInviteCommand("K7MPQ2XZ", "u-2")),
		).resolves.toBe("t-1");
		expect(await grants.holds("t-1", "u-2")).toBe(true);
	});

	it("asks for the table's password, and grants nothing for a wrong one", async () => {
		const { grants, handler } = setUp("plain:secret");

		for (const password of [undefined, "guess"]) {
			await expect(
				handler.execute(new RedeemInviteCommand("K7MPQ2XZ", "u-2", password)),
			).rejects.toMatchObject({ code: "lobby.wrong-password" });
		}
		expect(await grants.holds("t-1", "u-2")).toBe(false);
		await handler.execute(new RedeemInviteCommand("K7MPQ2XZ", "u-2", "secret"));
		expect(await grants.holds("t-1", "u-2")).toBe(true);
	});

	it("knows no invite of a closed table, or one never given", async () => {
		const { tables, handler } = setUp();
		tables.rows[0] = { ...tables.rows[0]!, status: "closed" };

		for (const code of ["K7MPQ2XZ", "AAAAAAAA"]) {
			await expect(
				handler.execute(new RedeemInviteCommand(code, "u-2")),
			).rejects.toMatchObject({ code: "lobby.invite-not-found" });
		}
	});
});
