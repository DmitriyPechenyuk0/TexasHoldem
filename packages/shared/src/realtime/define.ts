import { z } from "zod";
import type { Ack } from "../contracts/common/ack.js";
import type { Viewer } from "../contracts/identity/viewer.js";

/** Namespace of each realtime context. Connection-level events such as `ping` live on the root. */
export const NAMESPACES = {
	system: "/",
	table: "/table",
	lobby: "/lobby",
	social: "/social",
} as const;
export type NamespacePath = (typeof NAMESPACES)[keyof typeof NAMESPACES];

/**
 * One socket event. `ack` is the schema of the data a command replies with; events without it
 * are fire-and-forget. Realtime schemas never coerce or transform: JSON keeps types over a socket,
 * so the sender's type and the parsed type are the same.
 */
export interface EventDefinition<
	Name extends string = string,
	Payload extends z.ZodType = z.ZodType,
	AckData extends z.ZodType | undefined = z.ZodType | undefined,
> {
	readonly name: Name;
	readonly payload: Payload;
	readonly ack: AckData;
}

export function defineEvent<
	const Name extends string,
	Payload extends z.ZodType,
>(name: Name, payload: Payload): EventDefinition<Name, Payload, undefined>;
export function defineEvent<
	const Name extends string,
	Payload extends z.ZodType,
	AckData extends z.ZodType,
>(
	name: Name,
	payload: Payload,
	ack: AckData,
): EventDefinition<Name, Payload, AckData>;
export function defineEvent(
	name: string,
	payload: z.ZodType,
	ack?: z.ZodType,
): EventDefinition {
	return { name, payload, ack };
}

/**
 * Sent on every namespace when the socket's session is gone (expired, signed out, revoked by a
 * password reset), right before the server disconnects it. Sign in again, then reconnect.
 */
export const SessionExpiredEvent = defineEvent("session-expired", z.object({}));

/** What the server keeps on each socket (socket.io's `socket.data`); clients never see it. */
export interface SocketData {
	/** The signed-in user; null on a public namespace without a session. */
	viewer: Viewer | null;
}

type EventsByName<Events extends readonly EventDefinition[]> = {
	readonly [Event in Events[number] as Event["name"]]: Event;
};

export interface NamespaceDefinition<
	Path extends NamespacePath = NamespacePath,
	ClientEvents extends Readonly<Record<string, EventDefinition>> = Readonly<
		Record<string, EventDefinition>
	>,
	ServerEvents extends Readonly<Record<string, EventDefinition>> = Readonly<
		Record<string, EventDefinition>
	>,
> {
	readonly path: Path;
	/** Events the client emits, by name: the server looks up the payload schema here. */
	readonly clientToServer: ClientEvents;
	/** Events the server emits, by name; `session-expired` is on every namespace. */
	readonly serverToClient: ServerEvents;
}

const byName = <Events extends readonly EventDefinition[]>(
	events: Events,
): EventsByName<Events> =>
	Object.fromEntries(
		events.map((event) => [event.name, event]),
	) as EventsByName<Events>;

export function defineNamespace<
	Path extends NamespacePath,
	const ClientEvents extends readonly EventDefinition[],
	const ServerEvents extends readonly EventDefinition[],
>(
	path: Path,
	events: {
		readonly clientToServer: ClientEvents;
		readonly serverToClient: ServerEvents;
	},
): NamespaceDefinition<
	Path,
	EventsByName<ClientEvents>,
	EventsByName<[...ServerEvents, typeof SessionExpiredEvent]>
> {
	return {
		path,
		clientToServer: byName(events.clientToServer),
		serverToClient: byName([...events.serverToClient, SessionExpiredEvent]),
	};
}

/** The socket.io listener signature of one event: commands take an ack callback last. */
export type EventListener<Event extends EventDefinition> =
	Event["ack"] extends z.ZodType
		? (
				payload: z.infer<Event["payload"]>,
				ack: (reply: Ack<z.infer<Event["ack"]>>) => void,
			) => void
		: (payload: z.infer<Event["payload"]>) => void;

type SocketEvents<Events extends Readonly<Record<string, EventDefinition>>> = {
	[Name in keyof Events]: EventListener<Events[Name]>;
};

/** For `Server<ClientToServerEvents<N>, ServerToClientEvents<N>>` and `Socket<ServerToClientEvents<N>, ClientToServerEvents<N>>`. */
export type ClientToServerEvents<Namespace extends NamespaceDefinition> =
	SocketEvents<Namespace["clientToServer"]>;

export type ServerToClientEvents<Namespace extends NamespaceDefinition> =
	SocketEvents<Namespace["serverToClient"]>;
