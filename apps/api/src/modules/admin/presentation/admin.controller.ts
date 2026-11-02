import { TableId, UserId } from "@holdem/shared";
import {
	type AdminTablesResponse,
	AdminUsersQuery,
	type AdminUsersResponse,
	type AuditResponse,
	type RevokeSessionsResponse,
} from "@holdem/shared/contracts/admin";
import { Controller, Get, HttpCode, Post, UseGuards } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import type { PlayerCard } from "@/shared/application/player-directory.js";
import type { Viewer } from "@/shared/application/viewer.js";
import { AdminGuard } from "@/shared/presentation/admin.guard.js";
import { AuthGuard, CurrentUser } from "@/shared/presentation/auth.guard.js";
import {
	ValidParam,
	ValidQuery,
} from "@/shared/presentation/request-validation.js";
import { ForceCloseTableCommand } from "../application/commands/force-close-table/force-close-table.command.js";
import { RevokeUserSessionsCommand } from "../application/commands/revoke-user-sessions/revoke-user-sessions.command.js";
import { GetAuditQuery } from "../application/queries/get-audit/get-audit.query.js";
import { ListActiveTablesQuery } from "../application/queries/list-active-tables/list-active-tables.query.js";
import { LookUpUsersQuery } from "../application/queries/look-up-users/look-up-users.query.js";

const asUserId = (id: string) => id as UserId;
const asTableId = (id: string) => id as TableId;
const asCard = (card: PlayerCard | null) =>
	card && { ...card, userId: asUserId(card.userId) };

/**
 * `/api/admin` (POK-114): tables and accounts, for admins only; anyone else gets 403
 * `auth.admin-only`. Every change is logged and audited.
 */
@Controller("admin")
@UseGuards(AuthGuard, AdminGuard)
export class AdminController {
	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
	) {}

	@Get("tables")
	async tables(): Promise<AdminTablesResponse> {
		const tables = await this.queryBus.execute(new ListActiveTablesQuery());
		return tables.map((table) => ({
			tableId: asTableId(table.tableId),
			name: table.name,
			visibility: table.visibility,
			smallBlind: table.smallBlind,
			bigBlind: table.bigBlind,
			maxSeats: table.maxSeats,
			handsPlayed: table.handsPlayed,
			createdAt: table.createdAt.toISOString(),
			creator: asCard(table.creator),
			seats: table.seats.map(({ seat, userId, player }) => ({
				seat,
				userId: asUserId(userId),
				player: asCard(player),
			})),
		}));
	}

	/** Calls a running hand off, giving every chip back, and closes the table for everyone. */
	@Post("tables/:tableId/close")
	@HttpCode(204)
	async closeTable(
		@CurrentUser() viewer: Viewer,
		@ValidParam("tableId", TableId) tableId: string,
	): Promise<void> {
		await this.commandBus.execute(
			new ForceCloseTableCommand(viewer.userId, tableId),
		);
	}

	@Get("users")
	async users(
		@ValidQuery(AdminUsersQuery) { q }: AdminUsersQuery,
	): Promise<AdminUsersResponse> {
		const users = await this.queryBus.execute(new LookUpUsersQuery(q));
		return users.map((user) => ({
			userId: asUserId(user.userId),
			username: user.username,
			nickname: user.nickname,
			email: user.email,
			emailVerified: user.emailVerified,
			role: user.role,
			createdAt: user.createdAt.toISOString(),
			tables: user.tables.map((table) => ({
				...table,
				tableId: asTableId(table.tableId),
			})),
		}));
	}

	@Post("users/:userId/revoke-sessions")
	@HttpCode(200)
	async revokeSessions(
		@CurrentUser() viewer: Viewer,
		@ValidParam("userId", UserId) userId: string,
	): Promise<RevokeSessionsResponse> {
		const revoked = await this.commandBus.execute(
			new RevokeUserSessionsCommand(viewer.userId, userId),
		);
		return { revoked };
	}

	@Get("audit")
	async audit(): Promise<AuditResponse> {
		const entries = await this.queryBus.execute(new GetAuditQuery());
		return entries.map((entry) => ({
			...entry,
			adminId: entry.adminId === null ? null : asUserId(entry.adminId),
			details: { ...entry.details },
			at: entry.at.toISOString(),
		}));
	}
}
