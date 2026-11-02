import { Injectable } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import {
	type Database,
	InjectDatabase,
} from "@/shared/infrastructure/database/index.js";
import { MuteListRepository } from "../../domain/mute-list.repository.js";
import { mutes } from "./schema.js";

@Injectable()
export class DrizzleMuteListRepository extends MuteListRepository {
	constructor(@InjectDatabase() private readonly db: Database) {
		super();
	}

	async mute(userId: string, mutedId: string, at: Date): Promise<void> {
		await this.db
			.insert(mutes)
			.values({ userId, mutedId, mutedAt: at })
			.onConflictDoNothing();
	}

	async unmute(userId: string, mutedId: string): Promise<void> {
		await this.db
			.delete(mutes)
			.where(and(eq(mutes.userId, userId), eq(mutes.mutedId, mutedId)));
	}

	async mutedBy(
		userId: string,
	): Promise<readonly { mutedId: string; mutedAt: Date }[]> {
		return this.db
			.select({ mutedId: mutes.mutedId, mutedAt: mutes.mutedAt })
			.from(mutes)
			.where(eq(mutes.userId, userId))
			.orderBy(desc(mutes.mutedAt));
	}
}
