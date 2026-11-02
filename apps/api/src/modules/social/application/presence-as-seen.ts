import type { QueryBus } from "@nestjs/cqrs";
import { CanJoinTableQuery } from "@/shared/application/table-access.js";
import {
	type Presence,
	presenceFor,
	type Whereabouts,
} from "../domain/presence.js";

/** The player's presence as `viewerId` sees it: which of their tables the viewer may join. */
export async function presenceAsSeenBy(
	queryBus: QueryBus,
	whereabouts: Whereabouts,
	viewerId: string,
): Promise<Presence> {
	if (!whereabouts.online) {
		return { status: "offline" };
	}
	const joinable = await Promise.all(
		whereabouts.tables.map(async (tableId) =>
			(await queryBus.execute(new CanJoinTableQuery(tableId, viewerId)))
				? [tableId]
				: [],
		),
	);
	return presenceFor(whereabouts, new Set(joinable.flat()));
}
