import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { InviteNotFoundError } from "../../../domain/lobby-errors.js";
import { LobbyTableRepository } from "../../../domain/lobby-table.repository.js";
import { presetById } from "../../../domain/stake-presets.js";
import {
	type InviteSummary,
	ResolveInviteQuery,
} from "./resolve-invite.query.js";

@QueryHandler(ResolveInviteQuery)
export class ResolveInviteHandler implements IQueryHandler<ResolveInviteQuery> {
	constructor(private readonly tables: LobbyTableRepository) {}

	async execute({ code }: ResolveInviteQuery): Promise<InviteSummary> {
		const table = await this.tables.findOpenByInviteCode(code);
		const preset = table && presetById(table.presetId);
		if (!table || !preset) {
			throw new InviteNotFoundError();
		}
		return {
			tableId: table.id,
			name: table.name,
			smallBlind: preset.smallBlind,
			bigBlind: preset.bigBlind,
			maxSeats: table.maxSeats,
			passwordRequired: table.passwordHash !== null,
		};
	}
}
