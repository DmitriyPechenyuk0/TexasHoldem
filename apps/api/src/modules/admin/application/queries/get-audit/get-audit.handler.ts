import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { AdminAuditRepository } from "../../../domain/admin-audit.repository.js";
import type { AuditEntry } from "../../../domain/audit-entry.js";
import { AUDIT_PAGE, GetAuditQuery } from "./get-audit.query.js";

@QueryHandler(GetAuditQuery)
export class GetAuditHandler implements IQueryHandler<GetAuditQuery> {
	constructor(private readonly audit: AdminAuditRepository) {}

	execute(): Promise<readonly AuditEntry[]> {
		return this.audit.latest(AUDIT_PAGE);
	}
}
