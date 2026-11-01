import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import {
	LobbyTableNotFoundError,
	NotCreatorError,
	NotPrivateError,
} from "../../../domain/lobby-errors.js";
import { LobbyTableRepository } from "../../../domain/lobby-table.repository.js";
import { INVITE_CODE_TRIES, newInviteCode } from "../../invite-codes.js";
import { RegenerateInviteCommand } from "./regenerate-invite.command.js";

@CommandHandler(RegenerateInviteCommand)
export class RegenerateInviteHandler implements ICommandHandler<RegenerateInviteCommand> {
	constructor(private readonly tables: LobbyTableRepository) {}

	async execute({ tableId, userId }: RegenerateInviteCommand): Promise<string> {
		const table = await this.tables.findById(tableId);
		if (!table || table.status !== "open") {
			throw new LobbyTableNotFoundError();
		}
		if (table.creatorId !== userId) {
			throw new NotCreatorError();
		}
		if (table.visibility !== "private") {
			throw new NotPrivateError();
		}
		for (let tries = 0; tries < INVITE_CODE_TRIES; tries++) {
			const code = newInviteCode();
			if (await this.tables.setInviteCode(tableId, code)) {
				return code;
			}
		}
		throw new Error("No free invite code");
	}
}
