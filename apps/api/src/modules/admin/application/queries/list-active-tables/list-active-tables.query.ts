import { Query } from "@nestjs/cqrs";
import type { PlayerCard } from "@/shared/application/player-directory.js";
import type { OpenTableSummary } from "@/shared/application/open-tables.js";

export interface ActiveTable extends Omit<OpenTableSummary, "players"> {
	readonly creator: PlayerCard | null;
	readonly seats: readonly {
		readonly seat: number;
		readonly userId: string;
		readonly player: PlayerCard | null;
	}[];
}

/** Every open table, private ones too, newest first, with who created it and who sits there. */
export class ListActiveTablesQuery extends Query<readonly ActiveTable[]> {}
