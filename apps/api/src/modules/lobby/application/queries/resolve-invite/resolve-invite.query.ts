import { Query } from "@nestjs/cqrs";

/** The private table an invite leads to, as someone deciding to join it sees it. */
export interface InviteSummary {
	readonly tableId: string;
	readonly name: string;
	readonly smallBlind: number;
	readonly bigBlind: number;
	readonly maxSeats: number;
	readonly passwordRequired: boolean;
}

/** An unknown code is `lobby.invite-not-found`, which says nothing about a password. */
export class ResolveInviteQuery extends Query<InviteSummary> {
	constructor(readonly code: string) {
		super();
	}
}
