import { Query } from "@nestjs/cqrs";
import type { PlayerCard } from "@/shared/application/player-directory.js";
import type { InvitableTable } from "@/shared/application/table-invitations.js";

export interface TableInviteView {
	readonly from: PlayerCard;
	readonly table: InvitableTable;
	readonly expiresAt: Date;
}

/**
 * The invites waiting for the player, newest first, each with the table as it is now. An invite
 * to a table that closed, or that its sender may no longer join, is left out.
 */
export class GetTableInvitesQuery extends Query<readonly TableInviteView[]> {
	constructor(readonly userId: string) {
		super();
	}
}
