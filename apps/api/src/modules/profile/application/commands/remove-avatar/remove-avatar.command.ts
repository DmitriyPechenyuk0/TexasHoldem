import { Command } from "@nestjs/cqrs";

/** Back to the generated avatar. */
export class RemoveAvatarCommand extends Command<void> {
	constructor(readonly userId: string) {
		super();
	}
}
