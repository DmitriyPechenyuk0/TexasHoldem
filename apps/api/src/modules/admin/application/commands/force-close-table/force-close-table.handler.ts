import { CommandBus, CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { ExecuteTableCommand } from "@/modules/table/index.js";
import { AdminAuditLog } from "../../admin-audit-log.js";
import { ForceCloseTableCommand } from "./force-close-table.command.js";

/** Through the table's public API, wherever the table runs; audited once it is closed. */
@CommandHandler(ForceCloseTableCommand)
export class ForceCloseTableHandler implements ICommandHandler<ForceCloseTableCommand> {
	constructor(
		private readonly commandBus: CommandBus,
		private readonly audit: AdminAuditLog,
	) {}

	async execute({ adminId, tableId }: ForceCloseTableCommand): Promise<void> {
		await this.commandBus.execute(
			new ExecuteTableCommand(
				tableId,
				{ type: "ForceCloseTable" },
				{ userId: adminId },
			),
		);
		await this.audit.record(adminId, "force-close-table", tableId);
	}
}
