import { Query } from "@nestjs/cqrs";

/** An open table as an admin sees it: private ones too, with who created it and who sits there. */
export interface OpenTableSummary {
	readonly tableId: string;
	readonly name: string;
	readonly visibility: "public" | "private";
	readonly presetId: string;
	readonly smallBlind: number;
	readonly bigBlind: number;
	readonly maxSeats: number;
	readonly creatorId: string;
	readonly players: readonly {
		readonly seat: number;
		readonly userId: string;
	}[];
	readonly handsPlayed: number;
	readonly createdAt: Date;
}

/**
 * Every open table the lobby lists, newest first; only those `playerId` sits at, when given.
 * Asked by the admin context (POK-114) and answered by the lobby, in the shared kernel.
 */
export class ListOpenTablesQuery extends Query<readonly OpenTableSummary[]> {
	constructor(readonly playerId?: string) {
		super();
	}
}
