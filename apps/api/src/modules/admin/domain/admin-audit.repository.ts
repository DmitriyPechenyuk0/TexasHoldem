import type { AuditEntry } from "./audit-entry.js";

/** Every admin action, in Postgres (`admin_audit`), never edited or deleted by the app. */
export abstract class AdminAuditRepository {
	abstract record(entry: AuditEntry): Promise<void>;

	/** The latest entries, newest first. */
	abstract latest(limit: number): Promise<readonly AuditEntry[]>;
}
