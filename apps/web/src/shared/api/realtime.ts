import { ackOf } from "@holdem/shared";
import {
	PingEvent,
	type SystemClientToServerEvents,
	type SystemServerToClientEvents,
	systemNamespace,
} from "@holdem/shared/realtime";
import { io, type Socket } from "socket.io-client";
import { publicEnv } from "@/shared/config";
import { ApiError } from "./errors";

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

/** How long `ping` waits for the server's reply before it rejects. */
export const ACK_TIMEOUT_MS = 5_000;

export interface PingResult {
	readonly roundTripMs: number;
	readonly serverTime: Date;
}

/** Measures the round trip and reads the server clock, for latency display and timer correction. */
export async function ping(socket: SystemSocket): Promise<PingResult> {
	const sentAt = Date.now();
	const reply = PingReply.parse(
		await socket.timeout(ACK_TIMEOUT_MS).emitWithAck("ping", { sentAt }),
	);
	if (!reply.ok) {
		throw new ApiError(reply.error);
	}
	return {
		roundTripMs: Date.now() - reply.data.sentAt,
		serverTime: new Date(reply.data.serverTime),
	};
}
