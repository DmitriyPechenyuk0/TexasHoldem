import { Module } from "@nestjs/common";
import { CreateTableHandler } from "./application/commands/create-table/create-table.handler.js";
import { GetStakePresetsHandler } from "./application/queries/get-stake-presets/get-stake-presets.handler.js";
import { LobbyTableRepository } from "./domain/lobby-table.repository.js";
import { DrizzleLobbyTableRepository } from "./infrastructure/persistence/drizzle-lobby-table.repository.js";
import { LobbyController } from "./presentation/lobby.controller.js";

/**
 * Which tables there are, as players find and create them (Context Map, customer–supplier): the
 * lobby owns their listing and what they were created with; the table context runs them.
 */
@Module({
	controllers: [LobbyController],
	providers: [
		{ provide: LobbyTableRepository, useClass: DrizzleLobbyTableRepository },
		CreateTableHandler,
		GetStakePresetsHandler,
	],
})
export class LobbyModule {}
