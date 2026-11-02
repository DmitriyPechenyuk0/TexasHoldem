import type { UserId } from "@holdem/shared";
import { FindAccountsQuery } from "@/shared/application/accounts.js";
import { RevokeSessionsCommand } from "@/shared/application/accounts.js";
import { FindAccountsHandler } from "../../queries/find-accounts/find-accounts.handler.js";
import { InMemoryUsers } from "../in-memory-users.js";
import { RevokeSessionsHandler } from "./revoke-sessions.handler.js";

describe("admin lookups and revocations", () => {
	it("finds accounts by the start of their username, and ends every session of one", async () => {
		const users = new InMemoryUsers({
			["u-1" as UserId]: {
				username: "alice",
				locale: "en",
				emailVerified: true,
			},
			["u-2" as UserId]: {
				username: "bob",
				locale: "en",
				emailVerified: false,
			},
		});
		users.sessions.set("u-1", 3);

		expect(
			await new FindAccountsHandler(users).execute(new FindAccountsQuery("AL")),
		).toEqual([expect.objectContaining({ userId: "u-1", username: "alice" })]);
		const revoke = new RevokeSessionsHandler(users);
		expect(await revoke.execute(new RevokeSessionsCommand("u-1"))).toBe(3);
		expect(await revoke.execute(new RevokeSessionsCommand("u-1"))).toBe(0);
	});
});
