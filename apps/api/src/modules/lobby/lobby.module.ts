import { Module } from "@nestjs/common";
import { CloseIdleTablesHandler } from "./application/commands/close-idle-tables/close-idle-tables.handler.js";
import { CloseTableHandler } from "./application/commands/close-table/close-table.handler.js";
import { IdleTablesScheduler } from "./application/idle-tables.scheduler.js";
import { GrantTableAccessHandler } from "./application/commands/grant-table-access/grant-table-access.handler.js";
import { CreateTableHandler } from "./application/commands/create-table/create-table.handler.js";
import { RedeemInviteHandler } from "./application/commands/redeem-invite/redeem-invite.handler.js";
import { RegenerateInviteHandler } from "./application/commands/regenerate-invite/regenerate-invite.handler.js";
import { PasswordHasher } from "./application/password-hasher.js";
import { TableSummaryChangedHandler } from "./application/events/table-summary-changed.handler.js";
import { GetInvitableTableHandler } from "./application/queries/get-invitable-table/get-invitable-table.handler.js";
import { GetLobbyTablesHandler } from "./application/queries/get-lobby-tables/get-lobby-tables.handler.js";
import { GetMyTablesHandler } from "./application/queries/get-my-tables/get-my-tables.handler.js";
import { CanJoinTableHandler } from "./application/queries/can-join-table/can-join-table.handler.js";
import { GetStakePresetsHandler } from "./application/queries/get-stake-presets/get-stake-presets.handler.js";
import { ResolveInviteHandler } from "./application/queries/resolve-invite/resolve-invite.handler.js";
import { TableGrants } from "./application/table-grants.js";
import { LobbyTableRepository } from "./domain/lobby-table.repository.js";
import { DrizzleLobbyTableRepository } from "./infrastructure/persistence/drizzle-lobby-table.repository.js";
import { RedisTableGrants } from "./infrastructure/redis-table-grants.js";
import { ScryptPasswordHasher } from "./infrastructure/scrypt-password-hasher.js";
import { LobbyController } from "./presentation/lobby.controller.js";
import { LobbyGateway } from "./presentation/lobby.gateway.js";

/**
 * Which tables there are, as players find and create them (Context Map, customer–supplier): the
 * lobby owns their listing and what they were created with, and who may join a private one; the
 * table context runs them.
 */
@Module({
	controllers: [LobbyController],
	providers: [
		{ provide: LobbyTableRepository, useClass: DrizzleLobbyTableRepository },
		{ provide: PasswordHasher, useClass: ScryptPasswordHasher },
		{ provide: TableGrants, useClass: RedisTableGrants },
		CreateTableHandler,
		CloseTableHandler,
		CloseIdleTablesHandler,
		IdleTablesScheduler,
		RedeemInviteHandler,
		RegenerateInviteHandler,
		GetStakePresetsHandler,
		ResolveInviteHandler,
		CanJoinTableHandler,
		GetInvitableTableHandler,
		GrantTableAccessHandler,
		GetLobbyTablesHandler,
		GetMyTablesHandler,
		TableSummaryChangedHandler,
		LobbyGateway,
	],
})
export class LobbyModule {}
