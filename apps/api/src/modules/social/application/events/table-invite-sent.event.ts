import type { IEvent } from "@nestjs/cqrs";
import type { InvitableTable } from "@/shared/application/table-invitations.js";

/** In-process: a player invited a friend to a table; the `/social` gateway tells the friend. */
export class TableInviteSent implements IEvent {
	constructor(
		readonly inviteeId: string,
		readonly inviterId: string,
		readonly table: InvitableTable,
		readonly expiresAt: Date,
	) {}
}
