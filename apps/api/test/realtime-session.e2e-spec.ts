import { type Ack, Problem } from "@holdem/shared";
import {
	type ClientToServerEvents,
	defineEvent,
	defineNamespace,
	NAMESPACES,
	type ServerToClientEvents,
	type SocketData,
} from "@holdem/shared/realtime";
import { type INestApplication, UseGuards } from "@nestjs/common";
import { ConnectedSocket, SubscribeMessage } from "@nestjs/websockets";
import { eq } from "drizzle-orm";
import type { Socket as ServerSocket } from "socket.io";
import { io, type Socket } from "socket.io-client";
import request from "supertest";
import type { App } from "supertest/types.js";
import { z } from "zod";
import { users } from "@/modules/identity/infrastructure/persistence/schema.js";
import type { Viewer } from "@/shared/application/viewer.js";
import { CurrentUser } from "@/shared/presentation/auth.guard.js";
import { RealtimeGateway } from "@/shared/presentation/realtime/realtime-gateway.decorator.js";
import { RequirePlayer } from "@/shared/presentation/require-player.guard.js";
import { createTestApp } from "./support/create-test-app.js";
import {
	browser,
	PASSWORD,
	signUpAndVerify,
	WEB_ORIGIN,
} from "./support/identity.js";
import {
	createTestDatabase,
	type TestDatabase,
} from "./support/test-database.js";

const Empty = z.object({});
const ViewerReply = z.object({
	userId: z.string(),
	emailVerified: z.boolean(),
});

const tableProbe = defineNamespace(NAMESPACES.table, {
	clientToServer: [
		defineEvent("who-am-i", Empty, ViewerReply),
		defineEvent("take-seat", Empty, Empty),
	],
	serverToClient: [],
});
const rootProbe = defineNamespace(NAMESPACES.system, {
	clientToServer: [defineEvent("viewer", Empty, ViewerReply.nullable())],
	serverToClient: [],
});
type TableSocket = Socket<
	ServerToClientEvents<typeof tableProbe>,
	ClientToServerEvents<typeof tableProbe>
>;
type RootSocket = Socket<
	ServerToClientEvents<typeof rootProbe>,
	ClientToServerEvents<typeof rootProbe>
>;

const replyOf = (viewer: Viewer) => ({
	userId: viewer.userId,
	emailVerified: viewer.emailVerified,
});

@RealtimeGateway(tableProbe)
class TableProbeGateway {
	@SubscribeMessage("who-am-i")
	whoAmI(@CurrentUser() viewer: Viewer): Ack<z.infer<typeof ViewerReply>> {
		return { ok: true, data: replyOf(viewer) };
	}

	@SubscribeMessage("take-seat")
	@UseGuards(RequirePlayer)
	takeSeat(): Ack<Record<string, never>> {
		return { ok: true, data: {} };
	}
}

@RealtimeGateway(rootProbe)
class RootProbeGateway {
	@SubscribeMessage("viewer")
	viewer(
		@ConnectedSocket() socket: ServerSocket<object, object, object, SocketData>,
	): Ack<z.infer<typeof ViewerReply> | null> {
		const { viewer } = socket.data;
		return { ok: true, data: viewer && replyOf(viewer) };
	}
}

describe("Realtime sessions (e2e)", () => {
	let database: TestDatabase;
	let app: INestApplication<App>;
	let baseUrl: string;
	const sockets: Socket[] = [];

	beforeAll(async () => {
		database = await createTestDatabase();
		app = await createTestApp({
			config: { database: { url: database.url }, trustProxy: "loopback" },
			providers: [TableProbeGateway, RootProbeGateway],
		});
		await app.listen(0, "127.0.0.1");
		baseUrl = await app.getUrl();
	});

	afterAll(async () => {
		for (const socket of sockets) {
			socket.disconnect();
		}
		await app?.close();
		await database?.drop();
	});

	/** Signs a new verified user in; returns the session cookie for a Cookie header. */
	async function signedInCookie(): Promise<{
		cookie: string;
		email: string;
		userId: string;
	}> {
		const account = await signUpAndVerify(browser(app));
		const response = await request(app.getHttpServer())
			.post("/api/auth/sign-in/email")
			.set("Origin", WEB_ORIGIN)
			.set("X-Forwarded-For", "192.0.2.1")
			.send({ email: account.email, password: PASSWORD })
			.expect(200);
		const cookie = ([] as string[])
			.concat(response.headers["set-cookie"] ?? [])
			.map((header) => header.split(";")[0]!)
			.find((pair) => pair.startsWith("holdem.session_token="))!;
		return { cookie, email: account.email, userId: response.body.user.id };
	}

	/** Opens a socket as the browser would, with the cookie if any; resolves once connected. */
	function open<S extends Socket>(path: string, cookie?: string): S {
		const socket = io(`${baseUrl}${path}`, {
			transports: ["websocket"],
			extraHeaders: { origin: WEB_ORIGIN, ...(cookie ? { cookie } : {}) },
			forceNew: true,
			reconnection: false,
		});
		sockets.push(socket);
		return socket as S;
	}

	const connected = (socket: Socket) =>
		new Promise<void>((resolve, reject) => {
			socket.once("connect", resolve);
			socket.once("connect_error", reject);
		});

	const refusal = (socket: Socket) =>
		new Promise<Error & { data?: unknown }>((resolve, reject) => {
			socket.once("connect", () => reject(new Error("connected")));
			socket.once("connect_error", resolve);
		});

	it("lets an anonymous client into the public root namespace, without a viewer", async () => {
		const socket = open<RootSocket>("/");
		await connected(socket);

		expect(await socket.emitWithAck("viewer", {})).toEqual({
			ok: true,
			data: null,
		});
	});

	it.each([
		["no cookie", undefined],
		["a forged cookie", "holdem.session_token=forged.signature"],
	])(
		"refuses a client with %s on a namespace that needs a session",
		async (_, cookie) => {
			const error = await refusal(open("/table", cookie));

			expect(error.message).toBe("auth.unauthenticated");
			expect(Problem.parse(error.data)).toMatchObject({
				status: 401,
				code: "auth.unauthenticated",
			});
		},
	);

	it("knows the signed-in viewer on every namespace", async () => {
		const { cookie, userId } = await signedInCookie();
		const table = open<TableSocket>("/table", cookie);
		const root = open<RootSocket>("/", cookie);
		await Promise.all([connected(table), connected(root)]);

		const expected = { ok: true, data: { userId, emailVerified: true } };
		expect(await table.emitWithAck("who-am-i", {})).toEqual(expected);
		expect(await root.emitWithAck("viewer", {})).toEqual(expected);
	});

	it("reads the session again on every command, so RequirePlayer sees the email as it is now", async () => {
		const { cookie, email } = await signedInCookie();
		const socket = open<TableSocket>("/table", cookie);
		await connected(socket);
		const setVerified = (emailVerified: boolean) =>
			database.db
				.update(users)
				.set({ emailVerified })
				.where(eq(users.email, email));

		await setVerified(false);
		const refused = await socket.emitWithAck("take-seat", {});
		await setVerified(true);
		const allowed = await socket.emitWithAck("take-seat", {});

		expect(refused.ok).toBe(false);
		if (!refused.ok) {
			expect(refused.error).toMatchObject({
				status: 403,
				code: "auth.email-not-verified",
			});
		}
		expect(allowed).toEqual({ ok: true, data: {} });
	});

	it("says session-expired and disconnects on the first command after signing out", async () => {
		const { cookie } = await signedInCookie();
		const socket = open<TableSocket>("/table", cookie);
		await connected(socket);
		const expired = new Promise<void>((resolve) =>
			socket.once("session-expired", () => resolve()),
		);
		const disconnected = new Promise<string>((resolve) =>
			socket.once("disconnect", resolve),
		);

		await request(app.getHttpServer())
			.post("/api/auth/sign-out")
			.set("Origin", WEB_ORIGIN)
			.set("Cookie", cookie)
			.send({})
			.expect(200);
		let answered = false;
		socket.emit("who-am-i", {}, () => {
			answered = true;
		});

		await expired;
		expect(await disconnected).toBe("io server disconnect");
		expect(answered).toBe(false);
	});
});
