import { Query } from "@nestjs/cqrs";
import type { LobbyListing } from "../../lobby-listing.js";

export interface LobbyFilters {
	readonly presetId?: string;
	readonly maxSeats?: number;
	readonly hasFreeSeat?: boolean;
}

/** The open public tables, fullest first, then the newest. Private tables are never listed. */
export class GetLobbyTablesQuery extends Query<readonly LobbyListing[]> {
	constructor(readonly filters: LobbyFilters = {}) {
		super();
	}
}
