import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { DomainError } from "@/shared/domain/domain-error.js";
import { TableRuntimeRegistry } from "../../runtime/table-runtime-registry.js";
import { TablePresence } from "../../table-presence.js";
import { ConnectToTableCommand } from "./connect-to-table.command.js";

/**
 * Records the connection, and when it is the user's first at the table, tells the table they are
 * back. Most first connections are not reconnects, so the table's refusal is expected.
 */
@CommandHandler(ConnectToTableCommand)
export class ConnectToTableHandler implements ICommandHandler<ConnectToTableCommand> {
	constructor(
		private readonly presence: TablePresence,
		private readonly runtimes: TableRuntimeRegistry,
	) {}

	async execute({
		tableId,
		userId,
		connectionId,
	}: ConnectToTableCommand): Promise<void> {
		if (!(await this.presence.connect(tableId, userId, connectionId))) {
			return;
		}
		try {
			await this.runtimes.execute(
				tableId,
				{ type: "Reconnect", userId },
				{ userId },
			);
		} catch (error) {
			if (!(error instanceof DomainError)) {
				throw error;
			}
		}
	}
}
