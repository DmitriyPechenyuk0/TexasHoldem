import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { GrantTableAccessCommand } from "@/shared/application/table-invitations.js";
import { LobbyTableNotFoundError } from "../../../domain/lobby-errors.js";
import { LobbyTableRepository } from "../../../domain/lobby-table.repository.js";
import { TableGrants } from "../../table-grants.js";

/** A friend's accepted invite lets the player into a private table; a public one needs nothing. */
@CommandHandler(GrantTableAccessCommand)
export class GrantTableAccessHandler implements ICommandHandler<GrantTableAccessCommand> {
	constructor(
		private readonly tables: LobbyTableRepository,
		private readonly grants: TableGrants,
	) {}

	async execute({ tableId, userId }: GrantTableAccessCommand): Promise<void> {
		const table = await this.tables.findById(tableId);
		if (!table || table.status !== "open") {
			throw new LobbyTableNotFoundError();
		}
		if (table.visibility === "private") {
			await this.grants.grant(tableId, userId);
		}
	}
}
