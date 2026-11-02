import { CommandBus, CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { RevokeSessionsCommand } from "@/shared/application/accounts.js";
import { AdminAuditLog } from "../../admin-audit-log.js";
import { RevokeUserSessionsCommand } from "./revoke-user-sessions.command.js";

@CommandHandler(RevokeUserSessionsCommand)
export class RevokeUserSessionsHandler implements ICommandHandler<RevokeUserSessionsCommand> {
	constructor(
		private readonly commandBus: CommandBus,
		private readonly audit: AdminAuditLog,
	) {}

	async execute({
		adminId,
		userId,
	}: RevokeUserSessionsCommand): Promise<number> {
		const revoked = await this.commandBus.execute(
			new RevokeSessionsCommand(userId),
		);
		await this.audit.record(adminId, "revoke-sessions", userId, { revoked });
		return revoked;
	}
}
