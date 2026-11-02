import { eq } from "drizzle-orm";
import type { Database } from "@/shared/infrastructure/database/index.js";
import { friendships } from "../../infrastructure/persistence/schema.js";

/** The ids of the player's friends. */
export async function friendIdsOf(
	db: Database,
	userId: string,
): Promise<string[]> {
	const rows = await db
		.select({ friendId: friendships.friendId })
		.from(friendships)
		.where(eq(friendships.userId, userId));
	return rows.map(({ friendId }) => friendId);
}
