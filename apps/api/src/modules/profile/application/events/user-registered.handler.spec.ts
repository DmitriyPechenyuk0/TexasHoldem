import { UserId } from "@holdem/shared";
import { Logger } from "@nestjs/common";
import type { CommandBus } from "@nestjs/cqrs";
import { UserRegistered } from "@/modules/identity/index.js";
import { CreateProfileCommand } from "../commands/create-profile/create-profile.command.js";
import { UserRegisteredHandler } from "./user-registered.handler.js";

const userId = UserId.parse("0b7c6f1e-58a4-4f6b-9a39-5f0f6a8a1c2d");

describe("UserRegisteredHandler", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("creates the new account's profile", async () => {
		const execute = vi.fn(async () => undefined);

		await new UserRegisteredHandler({
			execute,
		} as unknown as CommandBus).handle(
			new UserRegistered(userId, "alice_01", "ru"),
		);

		expect(execute).toHaveBeenCalledWith(
			new CreateProfileCommand(userId, "alice_01", "ru"),
		);
	});

	it("logs a failure instead of passing it to whoever published the event", async () => {
		const error = vi
			.spyOn(Logger.prototype, "error")
			.mockImplementation(() => {});
		const failure = new Error("connection refused");
		const handler = new UserRegisteredHandler({
			execute: async () => {
				throw failure;
			},
		} as unknown as CommandBus);

		await expect(
			handler.handle(new UserRegistered(userId, "alice_01", "ru")),
		).resolves.toBeUndefined();
		expect(error).toHaveBeenCalledWith(
			failure,
			`No profile for the new user ${userId}`,
		);
	});
});
