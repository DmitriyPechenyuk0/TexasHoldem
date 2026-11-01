import { Query } from "@nestjs/cqrs";
import type { LobbyListing } from "../../lobby-listing.js";

/** One of the user's open tables: created by them or with them seated, private ones included. */
export interface MyTable extends LobbyListing {
	readonly visibility: "public" | "private";
	readonly mine: boolean;
	/** The invite code of a private table they created; null otherwise. */
	readonly inviteCode: string | null;
}

export class GetMyTablesQuery extends Query<readonly MyTable[]> {
	constructor(readonly userId: string) {
		super();
	}
}
