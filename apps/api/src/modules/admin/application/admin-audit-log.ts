import { randomUUID } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { Clock } from "@/shared/application/clock.js";
import { AdminAuditRepository } from "../domain/admin-audit.repository.js";
import type { AdminAction } from "../domain/audit-entry.js";

/** Records an admin action that succeeded: in the structured log, then in `admin_audit`. */
@Injectable()
export class AdminAuditLog {
	private readonly logger = new Logger(AdminAuditLog.name);

	constructor(
		private readonly audit: AdminAuditRepository,
		private readonly clock: Clock,
	) {}

	async record(
		adminId: string,
		action: AdminAction,
		target: string,
		details: Readonly<Record<string, unknown>> = {},
	): Promise<void> {
		this.logger.log({ msg: "admin action", adminId, action, target, details });
		await this.audit.record({
			id: randomUUID(),
			adminId,
			action,
			target,
			details,
			at: this.clock.now(),
		});
	}
}
