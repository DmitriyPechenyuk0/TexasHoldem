import { Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { HealthIndicator } from "../../application/health-indicator.js";
import { type Database, InjectDatabase } from "./database.js";

@Injectable()
export class DatabaseHealthIndicator extends HealthIndicator {
	readonly name = "database";

	constructor(@InjectDatabase() private readonly db: Database) {
		super();
	}

	async isHealthy(): Promise<boolean> {
		try {
			await this.db.execute(sql`select 1`);
			return true;
		} catch {
			return false;
		}
	}
}
