import { Injectable } from "@nestjs/common";
import { desc } from "drizzle-orm";
import {
	type Database,
	InjectDatabase,
} from "@/shared/infrastructure/database/index.js";
import { AdminAuditRepository } from "../../domain/admin-audit.repository.js";
import type { AdminAction, AuditEntry } from "../../domain/audit-entry.js";
import { audit } from "./schema.js";

@Injectable()
export class DrizzleAdminAuditRepository extends AdminAuditRepository {
	constructor(@InjectDatabase() private readonly db: Database) {
		super();
	}

	async record(entry: AuditEntry): Promise<void> {
		await this.db
			.insert(audit)
			.values({ ...entry, details: { ...entry.details } });
	}

	async latest(limit: number): Promise<readonly AuditEntry[]> {
		const rows = await this.db
			.select()
			.from(audit)
			.orderBy(desc(audit.at))
			.limit(limit);
		return rows.map((row) => ({ ...row, action: row.action as AdminAction }));
	}
}
