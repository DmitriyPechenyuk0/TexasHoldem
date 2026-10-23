import type { Server } from "socket.io";
import type { Socket } from "socket.io-client";
import { z } from "zod";
import type { Ack } from "../contracts/common/ack.js";
import { defineEvent, defineNamespace, NAMESPACES } from "./define.js";
import {
	PingAck,
	PingEvent,
	PingPayload,
	type SystemClientToServerEvents,
	type SystemServerToClientEvents,
	systemNamespace,
} from "./system.js";

describe("defineEvent and defineNamespace", () => {
	const SeatTaken = defineEvent("seat-taken", z.object({ seat: z.int() }));

	it("keep the name and schemas, with no ack for fire-and-forget events", () => {
		expect(SeatTaken.name).toBe("seat-taken");
		expect(SeatTaken.ack).toBeUndefined();
		expect(PingEvent.ack).toBe(PingAck);
	});

	it("index a namespace's events by name, so the server can find their schemas", () => {
		const table = defineNamespace(NAMESPACES.table, {
			clientToServer: [PingEvent],
			serverToClient: [SeatTaken],
		});

		expect(table.path).toBe("/table");
		expect(table.clientToServer.ping).toBe(PingEvent);
		expect(table.serverToClient["seat-taken"]).toBe(SeatTaken);
	});

	it("name the realtime namespaces", () => {
		expect(NAMESPACES).toEqual({
			system: "/",
			table: "/table",
			lobby: "/lobby",
			social: "/social",
		});
		expect(systemNamespace.clientToServer.ping).toBe(PingEvent);
	});
});

describe("ping", () => {
	it("carries the client clock and is answered with the server clock", () => {
		expect(PingPayload.parse({ sentAt: 1_729_700_000_000 })).toEqual({
			sentAt: 1_729_700_000_000,
		});
		expect(PingPayload.safeParse({ sentAt: "now" }).success).toBe(false);
		expect(
			PingAck.parse({ sentAt: 1, serverTime: "2026-10-23T12:00:00.000Z" }),
		).toEqual({ sentAt: 1, serverTime: "2026-10-23T12:00:00.000Z" });
	});
});

// The checks below are for the compiler: `pnpm typecheck` fails on any unused @ts-expect-error.
describe("socket.io typing", () => {
	it("types the client socket: payloads, event names and the ack reply", () => {
		const client = async (
			socket: Socket<SystemServerToClientEvents, SystemClientToServerEvents>,
		) => {
			const reply = await socket.emitWithAck("ping", { sentAt: 1 });
			expectTypeOf(reply).toEqualTypeOf<Ack<PingAck>>();

			// @ts-expect-error sentAt is a number of milliseconds.
			await socket.emitWithAck("ping", { sentAt: "1" });
			// @ts-expect-error a payload field is missing.
			await socket.emitWithAck("ping", {});
			// @ts-expect-error there is no such event.
			socket.emit("pong", { sentAt: 1 });
			// @ts-expect-error a command needs its ack callback.
			socket.emit("ping", { sentAt: 1 });
		};
		expect(client).toBeTypeOf("function");
	});

	it("types the server side: the payload it receives and the ack it must send", () => {
		const server = (
			io: Server<SystemClientToServerEvents, SystemServerToClientEvents>,
		) => {
			io.on("connection", (socket) => {
				socket.on("ping", (payload, ack) => {
					expectTypeOf(payload).toEqualTypeOf<PingPayload>();
					ack({
						ok: true,
						data: {
							sentAt: payload.sentAt,
							serverTime: "2026-10-23T12:00:00.000Z",
						},
					});
					// @ts-expect-error the ack data must be a PingAck.
					ack({ ok: true, data: { sentAt: payload.sentAt } });
				});
			});
		};
		expect(server).toBeTypeOf("function");
	});
});
