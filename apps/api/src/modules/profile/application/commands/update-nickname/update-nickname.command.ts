import type { UserId } from "@holdem/shared";
import { Command } from "@nestjs/cqrs";

/** Renames the player at the table; `nickname` is what they typed. */
export class UpdateNicknameCommand extends Command<void> {
	constructor(
		readonly userId: UserId,
		readonly nickname: string,
	) {
		super();
	}
}
