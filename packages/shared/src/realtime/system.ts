import { z } from "zod";
import {
	type ClientToServerEvents,
	defineEvent,
	defineNamespace,
	NAMESPACES,
	type ServerToClientEvents,
} from "./define.js";

/** Client clock when the ping left, in epoch milliseconds. */
export const PingPayload = z.object({ sentAt: z.int().nonnegative() });
export type PingPayload = z.infer<typeof PingPayload>;

/** Echoes `sentAt` for the round-trip time, plus the server clock for correcting the client's. */
export const PingAck = z.object({
	sentAt: z.int().nonnegative(),
	serverTime: z.iso.datetime(),
});
export type PingAck = z.infer<typeof PingAck>;

export const PingEvent = defineEvent("ping", PingPayload, PingAck);

export const systemNamespace = defineNamespace(NAMESPACES.system, {
	clientToServer: [PingEvent],
	serverToClient: [],
});

export type SystemClientToServerEvents = ClientToServerEvents<
	typeof systemNamespace
>;
export type SystemServerToClientEvents = ServerToClientEvents<
	typeof systemNamespace
>;
