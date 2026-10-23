import { ackOf } from "@holdem/shared";
import {
	PingEvent,
	type SystemClientToServerEvents,
	type SystemServerToClientEvents,
	systemNamespace,
} from "@holdem/shared/realtime";
import { io, type Socket } from "socket.io-client";
import { publicEnv } from "@/shared/config";

export type SystemSocket = Socket<
	SystemServerToClientEvents,
	SystemClientToServerEvents
>;

/** Connects to the api's root namespace, sending the session cookie along. */
export function connectSystemSocket(): SystemSocket {
	return io(new URL(systemNamespace.path, publicEnv.apiUrl).toString(), {
		withCredentials: true,
	});
}

const PingReply = ackOf(PingEvent.ack);

export interface PingResult {
	readonly roundTripMs: number;
	readonly serverTime: Date;
}

/** Measures the round trip and reads the server clock, for latency display and timer correction. */
export async function ping(socket: SystemSocket): Promise<PingResult> {
	const sentAt = Date.now();
	const reply = PingReply.parse(await socket.emitWithAck("ping", { sentAt }));
	if (!reply.ok) {
		throw new Error(`ping failed: ${reply.error.code}`);
	}
	return {
		roundTripMs: Date.now() - reply.data.sentAt,
		serverTime: new Date(reply.data.serverTime),
	};
}
