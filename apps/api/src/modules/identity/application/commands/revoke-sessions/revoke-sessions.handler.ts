import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { RevokeSessionsCommand } from "@/shared/application/accounts.js";
import { UserRepository } from "../../user.repository.js";

/**
 * Ends every session of the account (shared kernel, for admins). Better Auth then finds none for
 * its cookies; sockets notice at their next command, or at their idle recheck within a minute.
 */
@CommandHandler(RevokeSessionsCommand)
export class RevokeSessionsHandler implements ICommandHandler<RevokeSessionsCommand> {
	constructor(private readonly users: UserRepository) {}

	execute({ userId }: RevokeSessionsCommand): Promise<number> {
		return this.users.revokeSessions(userId);
	}
}
