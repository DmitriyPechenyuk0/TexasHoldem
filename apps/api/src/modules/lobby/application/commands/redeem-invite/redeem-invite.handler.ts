import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import {
	InviteNotFoundError,
	WrongPasswordError,
} from "../../../domain/lobby-errors.js";
import { LobbyTableRepository } from "../../../domain/lobby-table.repository.js";
import { PasswordHasher } from "../../password-hasher.js";
import { TableGrants } from "../../table-grants.js";
import { RedeemInviteCommand } from "./redeem-invite.command.js";

/** Grants access to the table the invite leads to, once its password, if any, is right. */
@CommandHandler(RedeemInviteCommand)
export class RedeemInviteHandler implements ICommandHandler<RedeemInviteCommand> {
	constructor(
		private readonly tables: LobbyTableRepository,
		private readonly passwords: PasswordHasher,
		private readonly grants: TableGrants,
	) {}

	async execute({
		code,
		userId,
		password,
	}: RedeemInviteCommand): Promise<string> {
		const table = await this.tables.findOpenByInviteCode(code);
		if (!table) {
			throw new InviteNotFoundError();
		}
		if (
			table.passwordHash !== null &&
			!(await this.passwords.verify(password ?? "", table.passwordHash))
		) {
			throw new WrongPasswordError();
		}
		await this.grants.grant(table.id, userId);
		return table.id;
	}
}
