import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { renameProfile } from "../../../domain/profile.js";
import { ProfileNotFoundError } from "../../../domain/profile-not-found.error.js";
import { ProfileRepository } from "../../../domain/profile.repository.js";
import { UpdateNicknameCommand } from "./update-nickname.command.js";

@CommandHandler(UpdateNicknameCommand)
export class UpdateNicknameHandler implements ICommandHandler<UpdateNicknameCommand> {
	constructor(private readonly profiles: ProfileRepository) {}

	async execute({ userId, nickname }: UpdateNicknameCommand): Promise<void> {
		const profile = await this.profiles.findByUserId(userId);
		if (!profile) {
			throw new ProfileNotFoundError();
		}
		const renamed = renameProfile(profile, nickname);
		if (!renamed.ok) {
			throw renamed.error;
		}
		await this.profiles.save(renamed.value);
	}
}
