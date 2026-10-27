import { Command } from "@nestjs/cqrs";

/** Makes the player's finished upload at `key` their avatar. */
export class ConfirmAvatarUploadCommand extends Command<void> {
	constructor(
		readonly userId: string,
		readonly key: string,
	) {
		super();
	}
}
