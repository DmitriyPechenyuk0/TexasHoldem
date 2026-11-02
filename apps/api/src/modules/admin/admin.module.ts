import { Module } from "@nestjs/common";
import { AdminAuditLog } from "./application/admin-audit-log.js";
import { ForceCloseTableHandler } from "./application/commands/force-close-table/force-close-table.handler.js";
import { RevokeUserSessionsHandler } from "./application/commands/revoke-user-sessions/revoke-user-sessions.handler.js";
import { GetAuditHandler } from "./application/queries/get-audit/get-audit.handler.js";
import { ListActiveTablesHandler } from "./application/queries/list-active-tables/list-active-tables.handler.js";
import { LookUpUsersHandler } from "./application/queries/look-up-users/look-up-users.handler.js";
import { AdminAuditRepository } from "./domain/admin-audit.repository.js";
import { DrizzleAdminAuditRepository } from "./infrastructure/persistence/drizzle-admin-audit.repository.js";
import { AdminController } from "./presentation/admin.controller.js";

/**
 * A limited admin (POK-114): open tables and closing them by force, accounts and signing them out,
 * and the audit of all of it. It owns nothing but the audit: it asks the other contexts through
 * the shared kernel and the table's public API.
 */
@Module({
	controllers: [AdminController],
	providers: [
		{ provide: AdminAuditRepository, useClass: DrizzleAdminAuditRepository },
		AdminAuditLog,
		ForceCloseTableHandler,
		RevokeUserSessionsHandler,
		ListActiveTablesHandler,
		LookUpUsersHandler,
		GetAuditHandler,
	],
})
export class AdminModule {}
