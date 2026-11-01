import type { Ack, TableId, UserId } from "@holdem/shared";
import {
	type FriendPresence,
	type SocialClientToServerEvents,
	socialNamespace,
	type SocialServerToClientEvents,
	type SocketData,
} from "@holdem/shared/realtime";
import {
	Logger,
	type OnModuleDestroy,
	type OnModuleInit,
	UseGuards,
} from "@nestjs/common";
import { CommandBus, EventBus, ofType, QueryBus } from "@nestjs/cqrs";
import {
	ConnectedSocket,
	type OnGatewayConnection,
	type OnGatewayDisconnect,
	SubscribeMessage,
	WebSocketServer,
} from "@nestjs/websockets";
import { merge, type Subscription } from "rxjs";
import type { DefaultEventsMap, Namespace, Socket } from "socket.io";
import {
	GetPlayerCardsQuery,
	type PlayerCard,
} from "@/shared/application/player-directory.js";
import type { Viewer } from "@/shared/application/viewer.js";
import { CurrentUser } from "@/shared/presentation/auth.guard.js";
import { SocketRateLimit } from "@/shared/presentation/realtime/socket-rate-limit.guard.js";
import { RealtimeGateway } from "@/shared/presentation/realtime/realtime-gateway.decorator.js";
import { ConnectToSocialCommand } from "../application/commands/connect-to-social/connect-to-social.command.js";
import { DisconnectFromSocialCommand } from "../application/commands/disconnect-from-social/disconnect-from-social.command.js";
import { FriendRequestSent } from "../application/events/friend-request-sent.event.js";
import { FriendshipCreated } from "../application/events/friendship-created.event.js";
import { PresenceChanged } from "../application/events/presence-changed.event.js";
import { TableInviteSent } from "../application/events/table-invite-sent.event.js";
import { GetFriendsPresenceQuery } from "../application/queries/get-friends-presence/get-friends-presence.query.js";
import {
	GetPresenceWatchersQuery,
	type PresenceWatcher,
} from "../application/queries/get-presence-watchers/get-presence-watchers.query.js";

type SocialNamespace = Namespace<
	SocialClientToServerEvents,
	SocialServerToClientEvents,
	DefaultEventsMap,
	SocketData
>;
type SocialSocket = Socket<
	SocialClientToServerEvents,
	SocialServerToClientEvents,
	DefaultEventsMap,
	SocketData
>;

/** Every `/social` socket of one player, on every instance (through the Redis adapter). */
export const playerRoom = (userId: string): string => `user:${userId}`;

const asCard = (card: PlayerCard) => ({
	...card,
	userId: card.userId as UserId,
});

const asFriendPresence = ({
	userId,
	presence,
}: {
	userId: string;
	presence: PresenceWatcher["presence"];
}): FriendPresence => ({
	userId: userId as UserId,
	presence:
		presence.status === "at-table"
			? { status: "at-table", tableId: presence.tableId as TableId }
			: presence,
});

/**
 * The `/social` namespace (POK-105). A player is online while any socket of theirs is connected
 * here, and goes offline a few seconds after the last one closes. Their online friends are told
 * every change of their presence, as each may see it, and they hear of friend requests and new
 * friends and table invites. Everything goes to player rooms, emitted on the instance where it happened.
 */
@RealtimeGateway(socialNamespace)
@UseGuards(SocketRateLimit)
export class SocialGateway
	implements
		OnGatewayConnection,
		OnGatewayDisconnect,
		OnModuleInit,
		OnModuleDestroy
{
	private readonly logger = new Logger(SocialGateway.name);
	@WebSocketServer()
	private readonly server!: SocialNamespace;
	private changes: Subscription | null = null;

	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
		private readonly eventBus: EventBus,
	) {}

	onModuleInit(): void {
		this.changes = merge(
			this.eventBus.pipe(ofType(PresenceChanged)),
			this.eventBus.pipe(ofType(FriendRequestSent)),
			this.eventBus.pipe(ofType(FriendshipCreated)),
			this.eventBus.pipe(ofType(TableInviteSent)),
		).subscribe((event) => {
			this.tell(event).catch((error: unknown) =>
				this.logger.error({
					msg: "social change not told",
					event: event.constructor.name,
					err: error,
				}),
			);
		});
	}

	onModuleDestroy(): void {
		this.changes?.unsubscribe();
	}

	/** Joins the player's room before they are shown online, so no change to them is missed. */
	async handleConnection(socket: SocialSocket): Promise<void> {
		const { viewer } = socket.data;
		if (!viewer) {
			return;
		}
		await socket.join(playerRoom(viewer.userId));
		await this.commandBus
			.execute(new ConnectToSocialCommand(viewer.userId, socket.id))
			.catch((error: unknown) =>
				this.logger.error({ msg: "connection not recorded", err: error }),
			);
	}

	async handleDisconnect(socket: SocialSocket): Promise<void> {
		const { viewer } = socket.data;
		if (!viewer) {
			return;
		}
		await this.commandBus
			.execute(new DisconnectFromSocialCommand(viewer.userId, socket.id))
			.catch((error: unknown) =>
				this.logger.error({ msg: "disconnection not recorded", err: error }),
			);
	}

	@SubscribeMessage(socialNamespace.clientToServer["friends-presence"].name)
	async friendsPresence(
		@ConnectedSocket() _socket: SocialSocket,
		@CurrentUser() viewer: Viewer,
	): Promise<Ack<readonly FriendPresence[]>> {
		const friends = await this.queryBus.execute(
			new GetFriendsPresenceQuery(viewer.userId),
		);
		return { ok: true, data: friends.map(asFriendPresence) };
	}

	private async tell(
		event:
			PresenceChanged | FriendRequestSent | FriendshipCreated | TableInviteSent,
	): Promise<void> {
		if (event instanceof PresenceChanged) {
			await this.tellPresence(event.userId);
		} else if (event instanceof TableInviteSent) {
			const [from] = await this.queryBus.execute(
				new GetPlayerCardsQuery([event.inviterId]),
			);
			if (from) {
				this.server
					.to(playerRoom(event.inviteeId))
					.emit("table-invite-received", {
						from: asCard(from),
						table: { ...event.table, tableId: event.table.tableId as TableId },
						expiresAt: event.expiresAt.toISOString(),
					});
			}
		} else if (event instanceof FriendRequestSent) {
			const [from] = await this.queryBus.execute(
				new GetPlayerCardsQuery([event.fromId]),
			);
			if (from) {
				this.server
					.to(playerRoom(event.toId))
					.emit("friend-request-received", { from: asCard(from) });
			}
		} else {
			const pair = [event.requesterId, event.accepterId];
			const cards = await this.queryBus.execute(new GetPlayerCardsQuery(pair));
			for (const card of cards) {
				const other = pair.find((userId) => userId !== card.userId)!;
				this.server
					.to(playerRoom(other))
					.emit("friend-added", { friend: asCard(card) });
			}
			await Promise.all(pair.map((userId) => this.tellPresence(userId)));
		}
	}

	/** Tells each online friend the player's presence as they may see it. */
	private async tellPresence(userId: string): Promise<void> {
		const watchers = await this.queryBus.execute(
			new GetPresenceWatchersQuery(userId),
		);
		for (const { viewerId, presence } of watchers) {
			this.server
				.to(playerRoom(viewerId))
				.emit("presence-changed", asFriendPresence({ userId, presence }));
		}
	}
}
