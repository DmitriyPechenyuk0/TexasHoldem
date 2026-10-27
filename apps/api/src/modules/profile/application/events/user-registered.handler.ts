import { CommandBus, EventsHandler, type IEventHandler } from "@nestjs/cqrs";
import { Logger } from "@nestjs/common";
import { UserRegistered } from "@/modules/identity/index.js";
import { CreateProfileCommand } from "../commands/create-profile/create-profile.command.js";

/** Every account gets its profile, with the username as its first nickname. */
@EventsHandler(UserRegistered)
export class UserRegisteredHandler implements IEventHandler<UserRegistered> {
	private readonly logger = new Logger(UserRegisteredHandler.name);

	constructor(private readonly commandBus: CommandBus) {}

	async handle({ userId, username, locale }: UserRegistered): Promise<void> {
		try {
			await this.commandBus.execute(
				new CreateProfileCommand(userId, username, locale),
			);
		} catch (error) {
			// The sign-up has already succeeded, so nobody waits for this to answer.
			this.logger.error(error, `No profile for the new user ${userId}`);
		}
	}
}
