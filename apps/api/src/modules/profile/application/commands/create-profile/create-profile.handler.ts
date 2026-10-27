import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { Clock } from "@/shared/application/clock.js";
import { createProfile } from "../../../domain/profile.js";
import { ProfileRepository } from "../../../domain/profile.repository.js";
import { CreateProfileCommand } from "./create-profile.command.js";

@CommandHandler(CreateProfileCommand)
export class CreateProfileHandler implements ICommandHandler<CreateProfileCommand> {
	constructor(
		private readonly profiles: ProfileRepository,
		private readonly clock: Clock,
	) {}

	async execute({
		userId,
		username,
		locale,
	}: CreateProfileCommand): Promise<void> {
		await this.profiles.add(
			createProfile({ userId, username, locale, now: this.clock.now() }),
		);
	}
}
