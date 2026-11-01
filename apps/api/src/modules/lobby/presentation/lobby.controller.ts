import {
	CreateTableRequest,
	type CreateTableResponse,
	type StakePresetsResponse,
} from "@holdem/shared/contracts/lobby";
import { Controller, Get, Post, UseGuards } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import type { Viewer } from "@/shared/application/viewer.js";
import { AuthGuard, CurrentUser } from "@/shared/presentation/auth.guard.js";
import { RequirePlayer } from "@/shared/presentation/require-player.guard.js";
import { ValidBody } from "@/shared/presentation/request-validation.js";
import { CreateTableCommand } from "../application/commands/create-table/create-table.command.js";
import { GetStakePresetsQuery } from "../application/queries/get-stake-presets/get-stake-presets.query.js";

/** `/api/lobby`: the stakes on offer, and creating tables. */
@Controller("lobby")
export class LobbyController {
	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
	) {}

	@Get("presets")
	presets(): Promise<StakePresetsResponse> {
		return this.queryBus.execute(new GetStakePresetsQuery());
	}

	/** Only a verified player creates a table: whoever creates one may sit at it. */
	@Post("tables")
	@UseGuards(AuthGuard, RequirePlayer)
	async create(
		@CurrentUser() viewer: Viewer,
		@ValidBody(CreateTableRequest) request: CreateTableRequest,
	): Promise<CreateTableResponse> {
		const tableId = await this.commandBus.execute(
			new CreateTableCommand(
				viewer.userId,
				request.name,
				request.presetId,
				request.maxSeats,
				request.visibility,
				request.turnSeconds,
			),
		);
		return { tableId: tableId as CreateTableResponse["tableId"] };
	}
}
