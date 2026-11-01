import { CommandBus, CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { Clock } from "@/shared/application/clock.js";
import { GrantTableAccessCommand } from "@/shared/application/table-invitations.js";
import { TableInviteNotFoundError } from "../../../domain/social-errors.js";
import { TableInvites } from "../../table-invites.js";
import { AnswerTableInviteCommand } from "./answer-table-invite.command.js";

/** An accepted invite lets the player into the table, a private one without its password. */
@CommandHandler(AnswerTableInviteCommand)
export class AnswerTableInviteHandler implements ICommandHandler<AnswerTableInviteCommand> {
	constructor(
		private readonly invites: TableInvites,
		private readonly commandBus: CommandBus,
		private readonly clock: Clock,
	) {}

	async execute({
		userId,
		inviterId,
		tableId,
		answer,
	}: AnswerTableInviteCommand): Promise<string> {
		const taken = await this.invites.take(
			userId,
			inviterId,
			tableId,
			this.clock.now(),
		);
		if (!taken) {
			throw new TableInviteNotFoundError();
		}
		if (answer === "accept") {
			await this.commandBus.execute(
				new GrantTableAccessCommand(tableId, userId),
			);
		}
		return tableId;
	}
}
