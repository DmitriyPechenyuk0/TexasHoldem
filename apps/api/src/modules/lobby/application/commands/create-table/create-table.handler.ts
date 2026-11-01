import { randomUUID } from "node:crypto";
import { CommandBus, CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { Clock } from "@/shared/application/clock.js";
import {
	DEFAULT_ABSENCE_POLICY,
	ExecuteTableCommand,
	type TableConfig,
} from "@/modules/table/index.js";
import { TooManyTablesError } from "../../../domain/lobby-errors.js";
import {
	createLobbyTable,
	MAX_OPEN_TABLES_PER_CREATOR,
} from "../../../domain/lobby-table.js";
import { LobbyTableRepository } from "../../../domain/lobby-table.repository.js";
import { CreateTableCommand } from "./create-table.command.js";

/** Seconds a turn lasts and seconds of time bank, unless the creator sets the turn. */
export const DEFAULT_TURN_SECONDS = 20;
export const TIME_BANK_SECONDS = 30;

/**
 * Stores the lobby's row first, so the per-player limit holds, then opens the table; a table that
 * could not be opened leaves no row behind.
 */
@CommandHandler(CreateTableCommand)
export class CreateTableHandler implements ICommandHandler<CreateTableCommand> {
	constructor(
		private readonly tables: LobbyTableRepository,
		private readonly commandBus: CommandBus,
		private readonly clock: Clock,
	) {}

	async execute(command: CreateTableCommand): Promise<string> {
		const { creatorId, turnSeconds = DEFAULT_TURN_SECONDS } = command;
		const created = createLobbyTable({
			id: randomUUID(),
			name: command.name,
			presetId: command.presetId,
			maxSeats: command.maxSeats,
			visibility: command.visibility,
			creatorId,
			createdAt: this.clock.now(),
		});
		if (!created.ok) {
			throw created.error;
		}
		const { table, preset } = created.value;
		if (
			!(await this.tables.addUnderLimit(table, MAX_OPEN_TABLES_PER_CREATOR))
		) {
			throw new TooManyTablesError(MAX_OPEN_TABLES_PER_CREATOR);
		}
		const config: TableConfig = {
			smallBlind: preset.smallBlind,
			bigBlind: preset.bigBlind,
			minBuyInBigBlinds: preset.minBuyInBigBlinds,
			maxBuyInBigBlinds: preset.maxBuyInBigBlinds,
			maxSeats: table.maxSeats,
			turnSeconds,
			timeBankSeconds: TIME_BANK_SECONDS,
			...DEFAULT_ABSENCE_POLICY,
			visibility: table.visibility,
		};
		try {
			await this.commandBus.execute(
				new ExecuteTableCommand(
					table.id,
					{ type: "OpenTable", tableId: table.id, config },
					{ userId: creatorId },
				),
			);
		} catch (error) {
			await this.tables.remove(table.id);
			throw error;
		}
		return table.id;
	}
}
