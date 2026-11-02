import { TableId } from "@holdem/shared";
import {
	CreateTableRequest,
	type CreateTableResponse,
	InviteCode,
	type InviteCodeResponse,
	type InviteResponse,
	LobbyTablesQuery,
	type LobbyTablesResponse,
	type MyTablesResponse,
	RedeemInviteRequest,
	type RedeemInviteResponse,
	type StakePresetsResponse,
} from "@holdem/shared/contracts/lobby";
import {
	Controller,
	Get,
	HttpCode,
	Post,
	Res,
	UseGuards,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import type { Response } from "express";
import {
	RateLimiter,
	type RateLimitRule,
} from "@/shared/application/rate-limiter.js";
import type { Viewer } from "@/shared/application/viewer.js";
import { AuthGuard, CurrentUser } from "@/shared/presentation/auth.guard.js";
import { rateLimited } from "@/shared/presentation/rate-limited.js";
import { RequirePlayer } from "@/shared/presentation/require-player.guard.js";
import {
	ValidBody,
	ValidParam,
	ValidQuery,
} from "@/shared/presentation/request-validation.js";
import { CloseTableCommand } from "../application/commands/close-table/close-table.command.js";
import { CreateTableCommand } from "../application/commands/create-table/create-table.command.js";
import { RedeemInviteCommand } from "../application/commands/redeem-invite/redeem-invite.command.js";
import { RegenerateInviteCommand } from "../application/commands/regenerate-invite/regenerate-invite.command.js";
import { GetLobbyTablesQuery } from "../application/queries/get-lobby-tables/get-lobby-tables.query.js";
import { GetMyTablesQuery } from "../application/queries/get-my-tables/get-my-tables.query.js";
import { GetStakePresetsQuery } from "../application/queries/get-stake-presets/get-stake-presets.query.js";
import { ResolveInviteQuery } from "../application/queries/resolve-invite/resolve-invite.query.js";

/** Password tries per user and table: enough for typos, too few to guess. */
export const TABLE_PASSWORD_RULE: RateLimitRule = {
	max: 5,
	windowSeconds: 15 * 60,
};

/**
 * Invite codes looked up per player: plenty for following links, far too few to find private
 * tables by trying codes (31⁸ of them).
 */
export const INVITE_LOOKUP_RULE: RateLimitRule = { max: 30, windowSeconds: 60 };

/**
 * Tables created per player: each opens a table runtime, and closing one frees a slot under the
 * open-table limit, so without this a player could create and close tables in a loop.
 */
export const CREATE_TABLE_RULE: RateLimitRule = {
	max: 20,
	windowSeconds: 60 * 60,
};

const asTableId = (id: string) => id as CreateTableResponse["tableId"];

/** `/api/lobby`: the stakes on offer, creating tables, and invites to private ones. */
@Controller("lobby")
export class LobbyController {
	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
		private readonly limiter: RateLimiter,
	) {}

	@Get("presets")
	presets(): Promise<StakePresetsResponse> {
		return this.queryBus.execute(new GetStakePresetsQuery());
	}

	/** The open public tables, fullest first. */
	@Get("tables")
	async tables(
		@ValidQuery(LobbyTablesQuery) filters: LobbyTablesQuery,
	): Promise<LobbyTablesResponse> {
		const listings = await this.queryBus.execute(
			new GetLobbyTablesQuery(filters),
		);
		return listings.map((listing) => ({
			...listing,
			tableId: asTableId(listing.tableId),
		}));
	}

	/** The tables I created or sit at, private ones included. */
	@Get("my-tables")
	@UseGuards(AuthGuard)
	async myTables(@CurrentUser() viewer: Viewer): Promise<MyTablesResponse> {
		const tables = await this.queryBus.execute(
			new GetMyTablesQuery(viewer.userId),
		);
		return tables.map((table) => ({
			...table,
			tableId: asTableId(table.tableId),
		}));
	}

	/** Only a verified player creates a table: whoever creates one may sit at it. */
	@Post("tables")
	@UseGuards(AuthGuard, RequirePlayer)
	async create(
		@CurrentUser() viewer: Viewer,
		@ValidBody(CreateTableRequest) request: CreateTableRequest,
		@Res({ passthrough: true }) response: Response,
	): Promise<CreateTableResponse> {
		const decision = await this.limiter.consume(
			`lobby:create-table:${viewer.userId}`,
			CREATE_TABLE_RULE,
		);
		if (!decision.allowed) {
			throw rateLimited(response, decision.retryAfterSeconds);
		}
		const { tableId, inviteCode } = await this.commandBus.execute(
			new CreateTableCommand(
				viewer.userId,
				request.name,
				request.presetId,
				request.maxSeats,
				request.visibility,
				request.turnSeconds,
				request.password,
			),
		);
		return { tableId: asTableId(tableId), inviteCode };
	}

	/** The creator closes their table, once nobody sits at it; it leaves the lobby. */
	@Post("tables/:tableId/close")
	@HttpCode(204)
	@UseGuards(AuthGuard)
	async close(
		@CurrentUser() viewer: Viewer,
		@ValidParam("tableId", TableId) tableId: string,
	): Promise<void> {
		await this.commandBus.execute(
			new CloseTableCommand(tableId, viewer.userId),
		);
	}

	/** The creator's new invite code for their private table. */
	@Post("tables/:tableId/invite")
	@UseGuards(AuthGuard, RequirePlayer)
	async regenerateInvite(
		@CurrentUser() viewer: Viewer,
		@ValidParam("tableId", TableId) tableId: string,
	): Promise<InviteCodeResponse> {
		const inviteCode = await this.commandBus.execute(
			new RegenerateInviteCommand(tableId, viewer.userId),
		);
		return { inviteCode };
	}

	@Get("invites/:code")
	@UseGuards(AuthGuard)
	async invite(
		@CurrentUser() viewer: Viewer,
		@ValidParam("code", InviteCode) code: string,
		@Res({ passthrough: true }) response: Response,
	): Promise<InviteResponse> {
		await this.limitLookups(viewer, response);
		const summary = await this.queryBus.execute(new ResolveInviteQuery(code));
		return { ...summary, tableId: asTableId(summary.tableId) };
	}

	/** Grants access to the private table; password tries are limited per user and table. */
	@Post("invites/:code/redeem")
	@HttpCode(200)
	@UseGuards(AuthGuard)
	async redeem(
		@CurrentUser() viewer: Viewer,
		@ValidParam("code", InviteCode) code: string,
		@ValidBody(RedeemInviteRequest) { password }: RedeemInviteRequest,
		@Res({ passthrough: true }) response: Response,
	): Promise<RedeemInviteResponse> {
		await this.limitLookups(viewer, response);
		const { tableId, passwordRequired } = await this.queryBus.execute(
			new ResolveInviteQuery(code),
		);
		if (passwordRequired) {
			const decision = await this.limiter.consume(
				`lobby:table-password:${tableId}:${viewer.userId}`,
				TABLE_PASSWORD_RULE,
			);
			if (!decision.allowed) {
				throw rateLimited(response, decision.retryAfterSeconds);
			}
		}
		const redeemed = await this.commandBus.execute(
			new RedeemInviteCommand(code, viewer.userId, password),
		);
		return { tableId: asTableId(redeemed) };
	}

	/** Looking an invite code up, to see its table or to redeem it, counts against one limit. */
	private async limitLookups(
		viewer: Viewer,
		response: Response,
	): Promise<void> {
		const decision = await this.limiter.consume(
			`lobby:invite-lookup:${viewer.userId}`,
			INVITE_LOOKUP_RULE,
		);
		if (!decision.allowed) {
			throw rateLimited(response, decision.retryAfterSeconds);
		}
	}
}
