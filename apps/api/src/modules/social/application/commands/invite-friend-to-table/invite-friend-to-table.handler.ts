import {
	CommandHandler,
	EventBus,
	type ICommandHandler,
	QueryBus,
} from "@nestjs/cqrs";
import { Clock } from "@/shared/application/clock.js";
import { GetInvitableTableQuery } from "@/shared/application/table-invitations.js";
import { FriendshipRepository } from "../../../domain/friendship.repository.js";
import {
	NotFriendsError,
	TableNotFoundError,
} from "../../../domain/social-errors.js";
import { TableInviteSent } from "../../events/table-invite-sent.event.js";
import { TableInvites } from "../../table-invites.js";
import { InviteFriendToTableCommand } from "./invite-friend-to-table.command.js";

/** How long an invite waits for an answer. */
export const TABLE_INVITE_TTL_MS = 10 * 60_000;

/**
 * Keeps the invite for the friend to answer, and tells them if they are online. Access to a
 * private table is granted only once they accept.
 */
@CommandHandler(InviteFriendToTableCommand)
export class InviteFriendToTableHandler implements ICommandHandler<InviteFriendToTableCommand> {
	constructor(
		private readonly friendships: FriendshipRepository,
		private readonly invites: TableInvites,
		private readonly queryBus: QueryBus,
		private readonly eventBus: EventBus,
		private readonly clock: Clock,
	) {}

	async execute({
		userId,
		friendId,
		tableId,
	}: InviteFriendToTableCommand): Promise<void> {
		if (!(await this.friendships.areFriends(userId, friendId))) {
			throw new NotFriendsError();
		}
		const table = await this.queryBus.execute(
			new GetInvitableTableQuery(tableId, userId),
		);
		if (!table) {
			throw new TableNotFoundError();
		}
		const expiresAt = new Date(
			this.clock.now().getTime() + TABLE_INVITE_TTL_MS,
		);
		await this.invites.add(friendId, userId, tableId, expiresAt);
		this.eventBus.publish(
			new TableInviteSent(friendId, userId, table, expiresAt),
		);
	}
}
