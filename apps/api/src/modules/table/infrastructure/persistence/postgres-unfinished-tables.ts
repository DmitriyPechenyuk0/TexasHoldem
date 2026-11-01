import { Injectable } from "@nestjs/common";
import { and, inArray, like, sql } from "drizzle-orm";
import {
	type Database,
	InjectDatabase,
} from "@/shared/infrastructure/database/index.js";
import { UnfinishedTables } from "../../application/unfinished-tables.js";
import { tableEvents } from "./schema.js";

const TABLE_STREAM = "table-";

/** Tables whose stream's last hand event is `HandScheduled`, with no `HandSettled` after it. */
@Injectable()
export class PostgresUnfinishedTables extends UnfinishedTables {
	constructor(@InjectDatabase() private readonly db: Database) {
		super();
	}

	async list(): Promise<readonly string[]> {
		const lastHandEvents = this.db
			.selectDistinctOn([tableEvents.streamId], {
				streamId: tableEvents.streamId,
				type: tableEvents.type,
			})
			.from(tableEvents)
			.where(
				and(
					like(tableEvents.streamId, `${TABLE_STREAM}%`),
					inArray(tableEvents.type, ["HandScheduled", "HandSettled"]),
				),
			)
			.orderBy(tableEvents.streamId, sql`${tableEvents.version} desc`)
			.as("last_hand_events");
		const rows = await this.db
			.select({ streamId: lastHandEvents.streamId })
			.from(lastHandEvents)
			.where(sql`${lastHandEvents.type} = 'HandScheduled'`);
		return rows.map(({ streamId }) => streamId.slice(TABLE_STREAM.length));
	}
}
