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
	type LobbyTable,
	MAX_OPEN_TABLES_PER_CREATOR,
} from "../../../domain/lobby-table.js";
import { LobbyTableRepository } from "../../../domain/lobby-table.repository.js";
import { INVITE_CODE_TRIES, newInviteCode } from "../../invite-codes.js";
import { PasswordHasher } from "../../password-hasher.js";
import {
	type CreatedTable,
	CreateTableCommand,
} from "./create-table.command.js";

/** Seconds a turn lasts and seconds of time bank, unless the creator sets the turn. */
export const DEFAULT_TURN_SECONDS = 20;
export const TIME_BANK_SECONDS = 30;

/**
 * Stores the lobby's row first, so the per-player limit holds, then opens the table; a table that
 * could not be opened leaves no row behind. A private table gets an invite code, and its password
 * is stored hashed.
 */
@CommandHandler(CreateTableCommand)
export class CreateTableHandler implements ICommandHandler<CreateTableCommand> {
	constructor(
		private readonly tables: LobbyTableRepository,
		private readonly commandBus: CommandBus,
		private readonly clock: Clock,
		private readonly passwords: PasswordHasher,
	) {}

	async execute(command: CreateTableCommand): Promise<CreatedTable> {
		const { creatorId, turnSeconds = DEFAULT_TURN_SECONDS, password } = command;
		const created = createLobbyTable({
			id: randomUUID(),
			name: command.name,
			presetId: command.presetId,
			maxSeats: command.maxSeats,
			visibility: command.visibility,
			creatorId,
			createdAt: this.clock.now(),
			inviteCode: newInviteCode(),
			password,
		});
		if (!created.ok) {
			throw created.error;
		}
		const { preset } = created.value;
		const table = await this.add({
			...created.value.table,
			passwordHash:
				password === undefined ? null : await this.passwords.hash(password),
		});
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
		return { tableId: table.id, inviteCode: table.inviteCode };
	}

	/** Stores the row, with another invite code should its own be taken; answers it as stored. */
	private async add(table: LobbyTable): Promise<LobbyTable> {
		let candidate = table;
		for (let tries = 1; ; tries++) {
			const outcome = await this.tables.addUnderLimit(
				candidate,
				MAX_OPEN_TABLES_PER_CREATOR,
			);
			if (outcome === "added") {
				return candidate;
			}
			if (outcome === "over-limit") {
				throw new TooManyTablesError(MAX_OPEN_TABLES_PER_CREATOR);
			}
			if (tries >= INVITE_CODE_TRIES) {
				throw new Error("No free invite code");
			}
			candidate = { ...table, inviteCode: newInviteCode() };
		}
	}
}
