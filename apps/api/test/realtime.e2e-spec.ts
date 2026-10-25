import { ackOf, Problem } from "@holdem/shared";
import {
	type ClientToServerEvents,
	defineEvent,
	defineNamespace,
	NAMESPACES,
	PingEvent,
	type SystemClientToServerEvents,
	type SystemServerToClientEvents,
} from "@holdem/shared/realtime";
import type { INestApplication } from "@nestjs/common";
import { SubscribeMessage } from "@nestjs/websockets";
import { io, type Socket } from "socket.io-client";
import request from "supertest";
import type { App } from "supertest/types.js";
import { z } from "zod";
import { DomainError } from "@/shared/domain/domain-error.js";
import { MAX_MESSAGE_BYTES } from "@/shared/infrastructure/realtime/socket-io.adapter.js";
import { RealtimeGateway } from "@/shared/presentation/realtime/realtime-gateway.decorator.js";
import { ValidPayload } from "@/shared/presentation/request-validation.js";
import { captureLogs } from "./support/capture-logs.js";
import { createTestApp } from "./support/create-test-app.js";
import { exampleConfig } from "./support/example-config.js";

class SeatTakenError extends DomainError {
	readonly kind = "conflict";
	readonly code = "table.seat-taken";
}

const Seat = z.object({ seat: z.int() });
// On the public root namespace, next to ping: these tests are about failures, not sessions.
const probeNamespace = defineNamespace(NAMESPACES.system, {
	clientToServer: [
		defineEvent("take-seat", Seat, Seat),
		defineEvent("crash", Seat, Seat),
		defineEvent("crash-quietly", Seat),
	],
	serverToClient: [],
});

@RealtimeGateway(probeNamespace)
class ProbeGateway {
	@SubscribeMessage("take-seat")
	takeSeat(@ValidPayload(Seat) { seat }: z.infer<typeof Seat>): never {
		throw new SeatTakenError(`Seat ${seat} is taken`, { params: { seat } });
	}

	@SubscribeMessage("crash")
	crash(): never {
		throw new Error("boom: redis://holdem:secret@cache");
	}

	@SubscribeMessage("crash-quietly")
	crashQuietly(): never {
		throw new Error("boom without an ack");
	}
}

describe("Realtime (e2e)", () => {
	const { lines } = captureLogs();
	const webOrigin = exampleConfig().webOrigin;
	let app: INestApplication<App>;
	let baseUrl: string;
	const sockets: Socket[] = [];

	const connect = async <Listen extends object, Emit extends object>(
		path: string,
	): Promise<Socket<Listen, Emit>> => {
		const socket: Socket<Listen, Emit> = io(`${baseUrl}${path}`, {
			transports: ["websocket"],
			forceNew: true,
			reconnection: false,
		});
		sockets.push(socket as Socket);
		await new Promise<void>((resolve, reject) => {
			socket.once("connect", resolve);
			socket.once("connect_error", reject);
		});
		return socket;
	};

	beforeAll(async () => {
		app = await createTestApp({ providers: [ProbeGateway] });
		await app.listen(0, "127.0.0.1");
		baseUrl = await app.getUrl();
	});

	afterAll(async () => {
		for (const socket of sockets) {
			socket.disconnect();
		}
		await app.close();
	});

	describe("ping", () => {
		let socket: Socket<SystemServerToClientEvents, SystemClientToServerEvents>;
		const PingReply = ackOf(PingEvent.ack);

		beforeAll(async () => {
			socket = await connect("/");
		});

		it("echoes sentAt and reports the server clock", async () => {
			const before = Date.now();
			const reply = PingReply.parse(
				await socket.emitWithAck("ping", { sentAt: 1_729_700_000_000 }),
			);
			const after = Date.now();

			expect(reply.ok).toBe(true);
			if (reply.ok) {
				expect(reply.data.sentAt).toBe(1_729_700_000_000);
				expect(Date.parse(reply.data.serverTime)).toBeGreaterThanOrEqual(
					before,
				);
				expect(Date.parse(reply.data.serverTime)).toBeLessThanOrEqual(after);
			}
		});

		it.each([
			["a payload of the wrong type", { sentAt: "now" }],
			["no payload", undefined],
		])(
			"validates at runtime: %s is answered with a 400 problem",
			async (_case, payload) => {
				// The compiler forbids these payloads; a client that is not this one can still send them.
				const untyped = socket as unknown as Socket;
				const reply = PingReply.parse(
					await untyped.emitWithAck("ping", payload),
				);

				expect(reply).toEqual({
					ok: false,
					error: expect.objectContaining({
						status: 400,
						code: "request.invalid",
						errors: [
							expect.objectContaining({ path: payload ? ["sentAt"] : [] }),
						],
					}),
				});
			},
		);
	});

	describe("failures in a gateway", () => {
		let socket: Socket<
			Record<string, never>,
			ClientToServerEvents<typeof probeNamespace>
		>;

		beforeAll(async () => {
			socket = await connect("/");
		});

		it("reply to a domain error with its problem, code and params", async () => {
			const reply = await socket.emitWithAck("take-seat", { seat: 3 });

			expect(reply.ok).toBe(false);
			if (!reply.ok) {
				expect(Problem.parse(reply.error)).toMatchObject({
					status: 409,
					code: "table.seat-taken",
					params: { seat: 3 },
					detail: "Seat 3 is taken",
				});
			}
		});

		it("reply to a bug with a bare 500 and log it with its stack", async () => {
			lines.length = 0;
			const reply = await socket.emitWithAck("crash", { seat: 1 });

			expect(reply).toEqual({
				ok: false,
				error: {
					type: "about:blank",
					title: "Internal Server Error",
					status: 500,
					code: "internal",
				},
			});
			expect(lines).toContainEqual(
				expect.objectContaining({
					level: "error",
					context: "AckExceptionFilter",
					err: expect.objectContaining({
						message: expect.stringContaining("boom"),
						stack: expect.stringContaining("ProbeGateway.crash"),
					}),
				}),
			);
		});

		it("log a failed fire-and-forget event and keep the connection", async () => {
			lines.length = 0;
			socket.emit("crash-quietly", { seat: 1 });

			const deadline = Date.now() + 2_000;
			while (
				!lines.some((line) => line.context === "AckExceptionFilter") &&
				Date.now() < deadline
			) {
				await new Promise((resolve) => setTimeout(resolve, 20));
			}
			expect(lines).toContainEqual(
				expect.objectContaining({
					level: "error",
					context: "AckExceptionFilter",
				}),
			);
			expect(socket.connected).toBe(true);
			expect((await socket.emitWithAck("take-seat", { seat: 2 })).ok).toBe(
				false,
			);
		});
	});

	describe("CORS", () => {
		it("lets the web app call HTTP endpoints with credentials, and nobody else", async () => {
			const allowed = await request(baseUrl)
				.get("/api/system/time")
				.set("origin", webOrigin)
				.expect(200);
			const foreign = await request(baseUrl)
				.get("/api/system/time")
				.set("origin", "https://evil.example")
				.expect(200);

			expect(allowed.headers["access-control-allow-origin"]).toBe(webOrigin);
			expect(allowed.headers["access-control-allow-credentials"]).toBe("true");
			// The allowed origin is fixed, so a browser on another origin sees a mismatch and blocks the response.
			expect(foreign.headers["access-control-allow-origin"]).toBe(webOrigin);
		});

		it("lets the web app open a socket.io session, and refuses any other origin", async () => {
			const handshake = (origin: string) =>
				request(baseUrl)
					.get("/socket.io/?EIO=4&transport=polling")
					.set("origin", origin);

			const allowed = await handshake(webOrigin).expect(200);
			expect(allowed.headers["access-control-allow-origin"]).toBe(webOrigin);
			expect(allowed.headers["access-control-allow-credentials"]).toBe("true");
			await handshake("https://evil.example").expect(403);
		});

		it("refuses a WebSocket from a page on another origin (cross-site WebSocket hijacking)", async () => {
			const attempt = (origin: string) =>
				new Promise<string>((resolve) => {
					const socket = io(baseUrl, {
						transports: ["websocket"],
						extraHeaders: { origin },
						forceNew: true,
						reconnection: false,
					});
					sockets.push(socket);
					socket.once("connect", () => resolve("connected"));
					socket.once("connect_error", () => resolve("refused"));
				});

			expect(await attempt(webOrigin)).toBe("connected");
			expect(await attempt("https://evil.example")).toBe("refused");
		});
	});

	it("drops a connection that sends a message over the size limit", async () => {
		const socket: Socket<
			SystemServerToClientEvents,
			SystemClientToServerEvents
		> = await connect(NAMESPACES.system);
		const disconnected = new Promise<string>((resolve) =>
			socket.once("disconnect", resolve),
		);
		const oversized = { sentAt: 0, padding: "x".repeat(MAX_MESSAGE_BYTES) };
		socket.emit("ping", oversized, () => undefined);
		expect(await disconnected).toBe("transport close");
	});
});
