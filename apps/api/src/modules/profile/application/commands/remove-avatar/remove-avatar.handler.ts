import { Logger } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { ObjectStorage } from "@/shared/application/object-storage.js";
import { changeAvatar } from "../../../domain/profile.js";
import { ProfileNotFoundError } from "../../../domain/profile-not-found.error.js";
import { ProfileRepository } from "../../../domain/profile.repository.js";
import { RemoveAvatarCommand } from "./remove-avatar.command.js";

@CommandHandler(RemoveAvatarCommand)
export class RemoveAvatarHandler implements ICommandHandler<RemoveAvatarCommand> {
	private readonly logger = new Logger(RemoveAvatarHandler.name);

	constructor(
		private readonly profiles: ProfileRepository,
		private readonly storage: ObjectStorage,
	) {}

	async execute({ userId }: RemoveAvatarCommand): Promise<void> {
		const profile = await this.profiles.findByUserId(userId);
		if (!profile) {
			throw new ProfileNotFoundError();
		}
		const changed = changeAvatar(profile, null);
		await this.profiles.save(changed.profile);
		if (changed.replacedKey) {
			const key = changed.replacedKey;
			await this.storage.delete(key).catch((error: unknown) => {
				this.logger.warn({
					msg: "avatar object not deleted",
					key,
					error: String(error),
				});
			});
		}
	}
}
