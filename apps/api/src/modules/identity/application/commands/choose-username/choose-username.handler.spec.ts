import { UserId } from "@holdem/shared";
import type { EventBus } from "@nestjs/cqrs";
import { UserRegistered } from "../../events/user-registered.event.js";
import { UserVerified } from "../../events/user-verified.event.js";
import { InMemoryUsers, type StoredUser } from "../in-memory-users.js";
import { ChooseUsernameCommand } from "./choose-username.command.js";
import { ChooseUsernameHandler } from "./choose-username.handler.js";

const userId = UserId.parse("0b7c6f1e-58a4-4f6b-9a39-5f0f6a8a1c2d");
const otherId = UserId.parse("5d1f2c3b-9a8e-4f7d-8c6b-1a2b3c4d5e6f");

const pending = (user: Partial<StoredUser> = {}): StoredUser => ({
	username: null,
	locale: "ru",
	emailVerified: true,
	...user,
});

function setUp(users: InMemoryUsers) {
	const published: unknown[] = [];
	const eventBus = {
		publish: (event: unknown) => published.push(event),
	} as unknown as EventBus;
	return { handler: new ChooseUsernameHandler(users, eventBus), published };
}

describe("ChooseUsernameHandler", () => {
	it("stores the username in lowercase and announces the account as registered, then verified", async () => {
		const users = new InMemoryUsers({ [userId]: pending() });
		const { handler, published } = setUp(users);

		await handler.execute(new ChooseUsernameCommand(userId, "Alice_01"));

		expect(users.rows.get(userId)?.username).toBe("alice_01");
		expect(published).toEqual([
			new UserRegistered(userId, "alice_01", "ru"),
			new UserVerified(userId),
		]);
	});

	it("announces no verification for an email the provider did not vouch for", async () => {
		const users = new InMemoryUsers({
			[userId]: pending({ emailVerified: false, locale: "xx" }),
		});
		const { handler, published } = setUp(users);

		await handler.execute(new ChooseUsernameCommand(userId, "alice_01"));

		// A locale the app no longer supports reads as the default.
		expect(published).toEqual([new UserRegistered(userId, "alice_01", "en")]);
	});

	it.each([
		[
			"identity.username-taken",
			{ [userId]: pending(), [otherId]: pending({ username: "alice_01" }) },
		],
		[
			"identity.username-already-chosen",
			{ [userId]: pending({ username: "bob" }) },
		],
		["identity.user-not-found", {}],
	])("throws %s and announces nothing", async (code, rows) => {
		const { handler, published } = setUp(new InMemoryUsers(rows));

		await expect(
			handler.execute(new ChooseUsernameCommand(userId, "ALICE_01")),
		).rejects.toMatchObject({ code });
		expect(published).toEqual([]);
	});
});
