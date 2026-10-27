import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { UserRepository } from "../../user.repository.js";
import { SetEmailLocaleCommand } from "./set-email-locale.command.js";

@CommandHandler(SetEmailLocaleCommand)
export class SetEmailLocaleHandler implements ICommandHandler<SetEmailLocaleCommand> {
	constructor(private readonly users: UserRepository) {}

	async execute({ userId, locale }: SetEmailLocaleCommand): Promise<void> {
		await this.users.setLocale(userId, locale);
	}
}
