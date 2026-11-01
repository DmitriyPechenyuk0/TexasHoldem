import type { Ack } from "@holdem/shared";
import {
	ActEvent,
	JoinTableEvent,
	LeaveSeatEvent,
	LeaveTableEvent,
	MuckCardsEvent,
	RebuyEvent,
	ShowCardsEvent,
	SitInEvent,
	SitOutEvent,
	type SocketData,
	type TableClientToServerEvents,
	type TableCommandAck,
	tableNamespace,
	type TableServerToClientEvents,
	type TableView,
	TakeSeatEvent,
	TopUpEvent,
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
import type { Subscription } from "rxjs";
import type { DefaultEventsMap, Namespace, Socket } from "socket.io";
import type { z } from "zod";
import { CanJoinTableQuery } from "@/shared/application/table-access.js";
import type { Viewer } from "@/shared/application/viewer.js";
import { DomainError } from "@/shared/domain/domain-error.js";
import { CurrentUser } from "@/shared/presentation/auth.guard.js";
import { SocketRateLimit } from "@/shared/presentation/realtime/socket-rate-limit.guard.js";
import { RealtimeGateway } from "@/shared/presentation/realtime/realtime-gateway.decorator.js";
import { ValidPayload } from "@/shared/presentation/request-validation.js";
import { RequirePlayer } from "@/shared/presentation/require-player.guard.js";
import { ConnectToTableCommand } from "../application/commands/connect-to-table/connect-to-table.command.js";
import { DisconnectFromTableCommand } from "../application/commands/disconnect-from-table/disconnect-from-table.command.js";
import {
	ExecuteTableCommand,
	type TableCommandInput,
} from "../application/commands/execute-table-command/execute-table-command.command.js";
import { TableChanged } from "../application/events/table-changed.event.js";
import { GetTableViewQuery } from "../application/queries/get-table-view/get-table-view.query.js";
import { TableAccessDeniedError } from "../application/table-access-denied.error.js";
import { eventsBatchFor, turnTimerOf } from "../application/table-views.js";

type TableNamespace = Namespace<
	TableClientToServerEvents,
	TableServerToClientEvents,
	DefaultEventsMap,
	SocketData
>;
type TableSocket = Socket<
	TableClientToServerEvents,
	TableServerToClientEvents,
	DefaultEventsMap,
	SocketData
>;
type Payload<Event extends { payload: z.ZodType }> = z.infer<Event["payload"]>;

/** Every socket that follows the table, whatever it may see. */
export const tableRoom = (tableId: string): string => `table:${tableId}`;
/** Every socket of one user: where their own view of each table they sit at goes. */
export const userRoom = (userId: string): string => `user:${userId}`;

const accepted: Ack<TableCommandAck> = { ok: true, data: {} };

/** Table events after which the turn clock reads differently. */
const CLOCK_EVENTS: ReadonlySet<string> = new Set([
	"TurnStarted",
	"TimeBankUsed",
	"HandSettled",
	"PlayerDisconnected",
	"PlayerReconnected",
]);

/**
 * The `/table` namespace (POK-82, POK-83). Commands go to the table's runtime through the command
 * bus and are answered once it took them; what they changed reaches every follower as an `events`
 * batch, redacted for each: a seated player's to their user room, the spectators' one to the rest
 * of the table's room. Nothing unredacted ever leaves: hand events carry the deck. Which sockets
 * follow each table is also told to the table (POK-85): a user's first one brings a disconnected
 * player back, and their last one disconnects a player or ends a spectator's watch.
 */
@RealtimeGateway(tableNamespace)
@UseGuards(SocketRateLimit)
export class TableGateway
	implements
		OnGatewayConnection,
		OnGatewayDisconnect,
		OnModuleInit,
		OnModuleDestroy
{
	private readonly logger = new Logger(TableGateway.name);
	@WebSocketServer()
	private readonly server!: TableNamespace;
	/** The tables each socket follows, to stop watching them when it disconnects. */
	private readonly following = new Map<string, Set<string>>();
	private changes: Subscription | null = null;

	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
		private readonly eventBus: EventBus,
	) {}

	onModuleInit(): void {
		this.changes = this.eventBus
			.pipe(ofType(TableChanged))
			.subscribe((change) => this.broadcast(change));
	}

	onModuleDestroy(): void {
		this.changes?.unsubscribe();
	}

	async handleConnection(socket: TableSocket): Promise<void> {
		const { viewer } = socket.data;
		if (viewer) {
			await socket.join(userRoom(viewer.userId));
		}
	}

	async handleDisconnect(socket: TableSocket): Promise<void> {
		const tables = this.following.get(socket.id) ?? new Set<string>();
		this.following.delete(socket.id);
		const { viewer } = socket.data;
		if (!viewer) {
			return;
		}
		const outcomes = await Promise.allSettled(
			[...tables].map((tableId) =>
				this.unfollow(tableId, viewer.userId, socket.id),
			),
		);
		for (const outcome of outcomes) {
			if (outcome.status === "rejected") {
				this.logger.error({
					msg: "disconnect not told to the table",
					err: outcome.reason,
				});
			}
		}
	}

	/**
	 * Follows the table and answers it as this user sees it. A user without a seat watches it as
	 * a spectator, whatever `as` says, so every follower without a seat counts against the limit.
	 * A disconnected player is back before the snapshot is taken, so it already shows them back.
	 */
	@SubscribeMessage(JoinTableEvent.name)
	async join(
		@ConnectedSocket() socket: TableSocket,
		@ValidPayload(JoinTableEvent.payload)
		{ tableId }: Payload<typeof JoinTableEvent>,
		@CurrentUser() viewer: Viewer,
	): Promise<Ack<TableView>> {
		const following = this.followed(socket).has(tableId);
		await this.ensureAccess(tableId, viewer);
		// The room first: a batch sent before the snapshot is older than it, and the client drops it.
		await socket.join(tableRoom(tableId));
		try {
			await this.commandBus.execute(
				new ConnectToTableCommand(tableId, viewer.userId, socket.id),
			);
			let view = await this.view(tableId, viewer);
			const seated = view.seats.some(({ userId }) => userId === viewer.userId);
			if (!seated && (await this.watch(tableId, viewer))) {
				view = await this.view(tableId, viewer);
			}
			this.followed(socket).add(tableId);
			return { ok: true, data: view };
		} catch (error) {
			// A join that failed takes back only what it started: a resync keeps following.
			if (!following) {
				await socket.leave(tableRoom(tableId));
				await this.unfollow(tableId, viewer.userId, socket.id);
			}
			throw error;
		}
	}

	@SubscribeMessage(LeaveTableEvent.name)
	async leave(
		@ConnectedSocket() socket: TableSocket,
		@ValidPayload(LeaveTableEvent.payload)
		{ tableId }: Payload<typeof LeaveTableEvent>,
		@CurrentUser() viewer: Viewer,
	): Promise<Ack<TableCommandAck>> {
		await socket.leave(tableRoom(tableId));
		if (this.followed(socket).delete(tableId)) {
			await this.unfollow(tableId, viewer.userId, socket.id);
		}
		return accepted;
	}

	@SubscribeMessage(TakeSeatEvent.name)
	@UseGuards(RequirePlayer)
	async takeSeat(
		@ValidPayload(TakeSeatEvent.payload)
		{ tableId, seat, buyIn }: Payload<typeof TakeSeatEvent>,
		@CurrentUser() viewer: Viewer,
	): Promise<Ack<TableCommandAck>> {
		await this.ensureAccess(tableId, viewer);
		return this.send(tableId, viewer, {
			type: "TakeSeat",
			userId: viewer.userId,
			verified: viewer.emailVerified,
			seat,
			buyIn,
		});
	}

	@SubscribeMessage(LeaveSeatEvent.name)
	@UseGuards(RequirePlayer)
	leaveSeat(
		@ValidPayload(LeaveSeatEvent.payload)
		{ tableId }: Payload<typeof LeaveSeatEvent>,
		@CurrentUser() viewer: Viewer,
	): Promise<Ack<TableCommandAck>> {
		return this.send(tableId, viewer, {
			type: "LeaveSeat",
			userId: viewer.userId,
		});
	}

	@SubscribeMessage(SitOutEvent.name)
	@UseGuards(RequirePlayer)
	sitOut(
		@ValidPayload(SitOutEvent.payload) { tableId }: Payload<typeof SitOutEvent>,
		@CurrentUser() viewer: Viewer,
	): Promise<Ack<TableCommandAck>> {
		return this.send(tableId, viewer, {
			type: "SitOut",
			userId: viewer.userId,
		});
	}

	@SubscribeMessage(SitInEvent.name)
	@UseGuards(RequirePlayer)
	sitIn(
		@ValidPayload(SitInEvent.payload) { tableId }: Payload<typeof SitInEvent>,
		@CurrentUser() viewer: Viewer,
	): Promise<Ack<TableCommandAck>> {
		return this.send(tableId, viewer, { type: "SitIn", userId: viewer.userId });
	}

	@SubscribeMessage(ActEvent.name)
	@UseGuards(RequirePlayer)
	act(
		@ValidPayload(ActEvent.payload)
		{ tableId, action, amount }: Payload<typeof ActEvent>,
		@CurrentUser() viewer: Viewer,
	): Promise<Ack<TableCommandAck>> {
		return this.send(tableId, viewer, {
			type: "Act",
			userId: viewer.userId,
			action,
			amount,
		});
	}

	@SubscribeMessage(ShowCardsEvent.name)
	@UseGuards(RequirePlayer)
	showCards(
		@ValidPayload(ShowCardsEvent.payload)
		{ tableId }: Payload<typeof ShowCardsEvent>,
		@CurrentUser() viewer: Viewer,
	): Promise<Ack<TableCommandAck>> {
		return this.send(tableId, viewer, {
			type: "ShowCards",
			userId: viewer.userId,
		});
	}

	@SubscribeMessage(MuckCardsEvent.name)
	@UseGuards(RequirePlayer)
	muckCards(
		@ValidPayload(MuckCardsEvent.payload)
		{ tableId }: Payload<typeof MuckCardsEvent>,
		@CurrentUser() viewer: Viewer,
	): Promise<Ack<TableCommandAck>> {
		return this.send(tableId, viewer, {
			type: "MuckCards",
			userId: viewer.userId,
		});
	}

	@SubscribeMessage(TopUpEvent.name)
	@UseGuards(RequirePlayer)
	topUp(
		@ValidPayload(TopUpEvent.payload)
		{ tableId, amount }: Payload<typeof TopUpEvent>,
		@CurrentUser() viewer: Viewer,
	): Promise<Ack<TableCommandAck>> {
		return this.send(tableId, viewer, {
			type: "TopUp",
			userId: viewer.userId,
			amount,
		});
	}

	@SubscribeMessage(RebuyEvent.name)
	@UseGuards(RequirePlayer)
	rebuy(
		@ValidPayload(RebuyEvent.payload)
		{ tableId, amount }: Payload<typeof RebuyEvent>,
		@CurrentUser() viewer: Viewer,
	): Promise<Ack<TableCommandAck>> {
		return this.send(tableId, viewer, {
			type: "Rebuy",
			userId: viewer.userId,
			amount,
		});
	}

	/**
	 * Sends each follower what they may see of one change: every seated player (and one who just
	 * left) their own batch, everyone else the spectators' batch.
	 */
	private broadcast({ tableId, versions, events, state }: TableChanged): void {
		const { table } = state;
		if (table.status === "unopened") {
			return;
		}
		const seats = new Map(
			table.players.map(({ userId, seat }) => [userId, seat]),
		);
		for (const event of events.table) {
			if (event.type === "SeatLeft") {
				seats.set(event.userId, event.seat);
			}
		}
		for (const [userId, seat] of seats) {
			this.server
				.to(userRoom(userId))
				.emit("events", eventsBatchFor(tableId, versions, events, seat));
		}
		this.server
			.to(tableRoom(tableId))
			.except([...seats.keys()].map(userRoom))
			.emit("events", eventsBatchFor(tableId, versions, events, "spectator"));
		// The turn clock is public: everyone following the table, and every player, sees it.
		if (events.table.some(({ type }) => CLOCK_EVENTS.has(type))) {
			this.server
				.to([tableRoom(tableId), ...[...seats.keys()].map(userRoom)])
				.emit("timer", {
					tableId: tableId as TableView["tableId"],
					timer: turnTimerOf(table),
				});
		}
	}

	private async send(
		tableId: string,
		viewer: Viewer,
		command: TableCommandInput,
	): Promise<Ack<TableCommandAck>> {
		await this.commandBus.execute(
			new ExecuteTableCommand(tableId, command, { userId: viewer.userId }),
		);
		return accepted;
	}

	/** A private table takes its creator and whoever redeemed its invite (the lobby decides). */
	private async ensureAccess(tableId: string, viewer: Viewer): Promise<void> {
		if (
			!(await this.queryBus.execute(
				new CanJoinTableQuery(tableId, viewer.userId),
			))
		) {
			throw new TableAccessDeniedError();
		}
	}

	private view(tableId: string, viewer: Viewer): Promise<TableView> {
		return this.queryBus.execute(new GetTableViewQuery(tableId, viewer.userId));
	}

	/** Starts watching as a spectator; answers whether that changed anything. */
	private async watch(tableId: string, viewer: Viewer): Promise<boolean> {
		try {
			await this.send(tableId, viewer, {
				type: "JoinAsSpectator",
				userId: viewer.userId,
			});
			return true;
		} catch (error) {
			if (
				error instanceof DomainError &&
				error.code === "table.already-spectating"
			) {
				return false;
			}
			throw error;
		}
	}

	/** The socket no longer follows the table: once none of the user's sockets does, the table knows. */
	private unfollow(
		tableId: string,
		userId: string,
		socketId: string,
	): Promise<void> {
		return this.commandBus.execute(
			new DisconnectFromTableCommand(tableId, userId, socketId),
		);
	}

	private followed(socket: TableSocket): Set<string> {
		let tables = this.following.get(socket.id);
		if (!tables) {
			tables = new Set();
			this.following.set(socket.id, tables);
		}
		return tables;
	}
}
