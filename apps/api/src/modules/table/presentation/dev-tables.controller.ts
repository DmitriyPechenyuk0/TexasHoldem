import { randomUUID } from "node:crypto";
import {
	CreateDevTableRequest,
	type CreateDevTableResponse,
} from "@holdem/shared/contracts/table";
import { Controller, Post } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import { ValidBody } from "@/shared/presentation/request-validation.js";
import { ExecuteTableCommand } from "../application/commands/execute-table-command/execute-table-command.command.js";

/** A 1/2 table for six with a buy-in of 50–200 big blinds, 20 s a turn and a 30 s time bank. */
export const DEV_TABLE_DEFAULTS = {
	smallBlind: 1,
	bigBlind: 2,
	minBuyInBigBlinds: 50,
	maxBuyInBigBlinds: 200,
	maxSeats: 6,
	turnSeconds: 20,
	timeBankSeconds: 30,
	visibility: "public",
} as const;

/**
 * Opens tables without the lobby, so the table can be played before M4. Registered outside
 * production only: a production build has no such route.
 */
@Controller("dev/tables")
export class DevTablesController {
	constructor(private readonly commandBus: CommandBus) {}

	@Post()
	async create(
		@ValidBody(CreateDevTableRequest) settings: CreateDevTableRequest,
	): Promise<CreateDevTableResponse> {
		const tableId = randomUUID() as CreateDevTableResponse["tableId"];
		await this.commandBus.execute(
			new ExecuteTableCommand(tableId, {
				type: "OpenTable",
				tableId,
				config: { ...DEV_TABLE_DEFAULTS, ...settings },
			}),
		);
		return { tableId };
	}
}
