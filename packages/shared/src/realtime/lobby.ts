import { z } from "zod";
import { TableId } from "../contracts/common/ids.js";
import { LobbyTable, LobbyTablesResponse } from "../contracts/lobby/lobby.js";
import {
	type ClientToServerEvents,
	defineEvent,
	defineNamespace,
	NAMESPACES,
	type ServerToClientEvents,
} from "./define.js";

/**
 * Starts following the lobby: answers the open public tables, as `GET /api/lobby/tables` does
 * unfiltered, and `table-upserted` / `table-removed` follow. Sent again, it is a fresh snapshot.
 */
export const WatchLobbyEvent = defineEvent(
	"watch",
	z.object({}),
	LobbyTablesResponse,
);

export const UnwatchLobbyEvent = defineEvent(
	"unwatch",
	z.object({}),
	z.object({}),
);

/** A public table opened, or its players changed: at most twice a second per table. */
export const LobbyTableUpsertedEvent = defineEvent(
	"table-upserted",
	LobbyTable,
);

/** A public table closed. */
export const LobbyTableRemovedEvent = defineEvent(
	"table-removed",
	z.object({ tableId: TableId }),
);

/** `/lobby`: the public tables as they change, for players picking one. */
export const lobbyNamespace = defineNamespace(NAMESPACES.lobby, {
	clientToServer: [WatchLobbyEvent, UnwatchLobbyEvent],
	serverToClient: [LobbyTableUpsertedEvent, LobbyTableRemovedEvent],
});

export type LobbyClientToServerEvents = ClientToServerEvents<
	typeof lobbyNamespace
>;
export type LobbyServerToClientEvents = ServerToClientEvents<
	typeof lobbyNamespace
>;
