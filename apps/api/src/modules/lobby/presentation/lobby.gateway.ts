import {
	type LobbyClientToServerEvents,
	lobbyNamespace,
	type LobbyServerToClientEvents,
	type SocketData,
} from "@holdem/shared/realtime";
import type { LobbyTablesResponse } from "@holdem/shared/contracts/lobby";
import type { Ack } from "@holdem/shared";
import {
	type OnModuleDestroy,
	type OnModuleInit,
	UseGuards,
} from "@nestjs/common";
import { EventBus, ofType, QueryBus } from "@nestjs/cqrs";
import {
	ConnectedSocket,
	SubscribeMessage,
	WebSocketServer,
} from "@nestjs/websockets";
import type { Subscription } from "rxjs";
import type { DefaultEventsMap, Namespace, Socket } from "socket.io";
import { Clock } from "@/shared/application/clock.js";
import { SocketRateLimit } from "@/shared/presentation/realtime/socket-rate-limit.guard.js";
import { RealtimeGateway } from "@/shared/presentation/realtime/realtime-gateway.decorator.js";
import { LobbyTableChanged } from "../application/events/lobby-table-changed.event.js";
import { listingOf } from "../application/lobby-listing.js";
import { GetLobbyTablesQuery } from "../application/queries/get-lobby-tables/get-lobby-tables.query.js";

type LobbyNamespace = Namespace<
	LobbyClientToServerEvents,
	LobbyServerToClientEvents,
	DefaultEventsMap,
	SocketData
>;
type LobbySocket = Socket<
	LobbyClientToServerEvents,
	LobbyServerToClientEvents,
	DefaultEventsMap,
	SocketData
>;
type Listing = LobbyTablesResponse[number];

/** Every socket that watches the lobby, on every instance (through the Redis adapter). */
export const LOBBY_ROOM = "lobby";

/** At most one update a table every this long; the last one always goes out. */
export const LOBBY_UPDATE_EVERY_MS = 500;

interface Pending {
	timer: ReturnType<typeof setTimeout>;
	listing: Listing;
}

/**
 * The `/lobby` namespace (POK-97). `watch` answers the open public tables and joins the lobby's
 * room; every change to a listed table then reaches it as `table-upserted`, or `table-removed`
 * once it closes. Changes come from the table's summaries on the instance that runs it, so the
 * per-table throttle there holds for every watcher. Private tables never go out.
 */
@RealtimeGateway(lobbyNamespace)
@UseGuards(SocketRateLimit)
export class LobbyGateway implements OnModuleInit, OnModuleDestroy {
	@WebSocketServer()
	private readonly server!: LobbyNamespace;
	private changes: Subscription | null = null;
	private readonly sentAt = new Map<string, number>();
	private readonly pending = new Map<string, Pending>();

	constructor(
		private readonly queryBus: QueryBus,
		private readonly eventBus: EventBus,
		private readonly clock: Clock,
	) {}

	onModuleInit(): void {
		this.changes = this.eventBus
			.pipe(ofType(LobbyTableChanged))
			.subscribe(({ table }) => {
				if (table.visibility !== "public") {
					return;
				}
				if (table.status === "closed") {
					this.cancel(table.id);
					this.sentAt.delete(table.id);
					this.server
						.to(LOBBY_ROOM)
						.emit("table-removed", { tableId: table.id as Listing["tableId"] });
					return;
				}
				const listing = listingOf(table);
				this.upsert({
					...listing,
					tableId: listing.tableId as Listing["tableId"],
				});
			});
	}

	onModuleDestroy(): void {
		this.changes?.unsubscribe();
		for (const { timer } of this.pending.values()) {
			clearTimeout(timer);
		}
		this.pending.clear();
	}

	/** Joins the room first, so no change between the snapshot and the room is missed. */
	@SubscribeMessage(lobbyNamespace.clientToServer.watch.name)
	async watch(
		@ConnectedSocket() socket: LobbySocket,
	): Promise<Ack<LobbyTablesResponse>> {
		await socket.join(LOBBY_ROOM);
		const listings = await this.queryBus.execute(new GetLobbyTablesQuery());
		return {
			ok: true,
			data: listings.map((listing) => ({
				...listing,
				tableId: listing.tableId as Listing["tableId"],
			})),
		};
	}

	@SubscribeMessage(lobbyNamespace.clientToServer.unwatch.name)
	async unwatch(
		@ConnectedSocket() socket: LobbySocket,
	): Promise<Ack<Record<string, never>>> {
		await socket.leave(LOBBY_ROOM);
		return { ok: true, data: {} };
	}

	/** Sends the listing now, or once the table's last update is far enough behind. */
	private upsert(listing: Listing): void {
		const { tableId } = listing;
		const waiting = this.pending.get(tableId);
		if (waiting) {
			waiting.listing = listing;
			return;
		}
		const now = this.clock.now().getTime();
		const wait =
			(this.sentAt.get(tableId) ?? -Infinity) + LOBBY_UPDATE_EVERY_MS - now;
		if (wait <= 0) {
			this.send(listing, now);
			return;
		}
		const pending: Pending = {
			listing,
			timer: setTimeout(() => {
				this.pending.delete(tableId);
				this.send(pending.listing, this.clock.now().getTime());
			}, wait),
		};
		this.pending.set(tableId, pending);
	}

	private send(listing: Listing, now: number): void {
		this.sentAt.set(listing.tableId, now);
		this.server.to(LOBBY_ROOM).emit("table-upserted", listing);
	}

	private cancel(tableId: string): void {
		const waiting = this.pending.get(tableId);
		if (waiting) {
			clearTimeout(waiting.timer);
			this.pending.delete(tableId);
		}
	}
}
