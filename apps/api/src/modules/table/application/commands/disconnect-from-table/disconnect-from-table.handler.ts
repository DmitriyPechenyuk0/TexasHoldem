import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { DomainError } from "@/shared/domain/domain-error.js";
import { TableRuntimeRegistry } from "../../runtime/table-runtime-registry.js";
import { TablePresence } from "../../table-presence.js";
import { DisconnectFromTableCommand } from "./disconnect-from-table.command.js";

/**
 * Forgets the connection, and when it was the user's last at the table, tells the table. A user
 * neither seated nor watching, or a table closed or gone, leaves nothing to do.
 */
@CommandHandler(DisconnectFromTableCommand)
export class DisconnectFromTableHandler implements ICommandHandler<DisconnectFromTableCommand> {
	constructor(
		private readonly presence: TablePresence,
		private readonly runtimes: TableRuntimeRegistry,
	) {}

	async execute({
		tableId,
		userId,
		connectionId,
	}: DisconnectFromTableCommand): Promise<void> {
		if (!(await this.presence.disconnect(tableId, userId, connectionId))) {
			return;
		}
		try {
			await this.runtimes.execute(
				tableId,
				{ type: "Disconnect", userId },
				{ userId },
			);
		} catch (error) {
			if (!(error instanceof DomainError)) {
				throw error;
			}
		}
	}
}
