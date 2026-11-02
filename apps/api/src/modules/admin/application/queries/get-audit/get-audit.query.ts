import { Query } from "@nestjs/cqrs";
import type { AuditEntry } from "../../../domain/audit-entry.js";

/** How many audit entries one request shows. */
export const AUDIT_PAGE = 100;

/** The latest admin actions, newest first. */
export class GetAuditQuery extends Query<readonly AuditEntry[]> {}
