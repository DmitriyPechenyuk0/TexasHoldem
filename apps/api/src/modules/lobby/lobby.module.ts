import { Module } from "@nestjs/common";
import { CreateTableHandler } from "./application/commands/create-table/create-table.handler.js";
import { RedeemInviteHandler } from "./application/commands/redeem-invite/redeem-invite.handler.js";
import { RegenerateInviteHandler } from "./application/commands/regenerate-invite/regenerate-invite.handler.js";
import { PasswordHasher } from "./application/password-hasher.js";
import { CanJoinTableHandler } from "./application/queries/can-join-table/can-join-table.handler.js";
import { GetStakePresetsHandler } from "./application/queries/get-stake-presets/get-stake-presets.handler.js";
import { ResolveInviteHandler } from "./application/queries/resolve-invite/resolve-invite.handler.js";
import { TableGrants } from "./application/table-grants.js";
import { LobbyTableRepository } from "./domain/lobby-table.repository.js";
import { DrizzleLobbyTableRepository } from "./infrastructure/persistence/drizzle-lobby-table.repository.js";
import { RedisTableGrants } from "./infrastructure/redis-table-grants.js";
import { ScryptPasswordHasher } from "./infrastructure/scrypt-password-hasher.js";
import { LobbyController } from "./presentation/lobby.controller.js";

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
		RedeemInviteHandler,
		RegenerateInviteHandler,
		GetStakePresetsHandler,
		ResolveInviteHandler,
		CanJoinTableHandler,
	],
})
export class LobbyModule {}
