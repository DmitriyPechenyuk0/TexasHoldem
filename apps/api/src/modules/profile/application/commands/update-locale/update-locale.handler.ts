import { CommandBus, CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { SetEmailLocaleCommand } from "@/modules/identity/index.js";
import { changeLocale } from "../../../domain/profile.js";
import { ProfileNotFoundError } from "../../../domain/profile-not-found.error.js";
import { ProfileRepository } from "../../../domain/profile.repository.js";
import { UpdateLocaleCommand } from "./update-locale.command.js";

@CommandHandler(UpdateLocaleCommand)
export class UpdateLocaleHandler implements ICommandHandler<UpdateLocaleCommand> {
	constructor(
		private readonly profiles: ProfileRepository,
		private readonly commandBus: CommandBus,
	) {}

	async execute({ userId, locale }: UpdateLocaleCommand): Promise<void> {
		const profile = await this.profiles.findByUserId(userId);
		if (!profile) {
			throw new ProfileNotFoundError();
		}
		await this.profiles.save(changeLocale(profile, locale));
		// Identity sends the emails, in the language it keeps. Both steps are idempotent, so a
		// failure here is mended by sending the same request again.
		await this.commandBus.execute(new SetEmailLocaleCommand(userId, locale));
	}
}
