import type { z } from "zod";
import type { Ack } from "../contracts/common/ack.js";

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
	/** Events the server emits, by name. */
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
	EventsByName<ServerEvents>
> {
	return {
		path,
		clientToServer: byName(events.clientToServer),
		serverToClient: byName(events.serverToClient),
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
