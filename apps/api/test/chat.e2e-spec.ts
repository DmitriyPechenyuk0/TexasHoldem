import type { Ack } from "@holdem/shared";
import type {
	ChatClientToServerEvents,
	ChatMessage,
	ChatServerToClientEvents,
} from "@holdem/shared/realtime";
import type { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import type { Socket } from "socket.io-client";
import request from "supertest";
import type { App } from "supertest/types.js";
import { randomUUID } from "node:crypto";
import { ChatHistory } from "@/modules/chat/application/chat-history.js";
import { users } from "@/modules/identity/infrastructure/persistence/schema.js";
import { PotsAwarded } from "@/modules/table/index.js";
import { IntegrationEventBus } from "@/shared/application/integration-events.js";
import { createTestApp } from "./support/create-test-app.js";
import { WEB_ORIGIN } from "./support/identity.js";
import { connectedSocket, signedInUser } from "./support/realtime.js";
import {
	createTestDatabase,
	type TestDatabase,
} from "./support/test-database.js";

type ChatSocket = Socket<ChatServerToClientEvents, ChatClientToServerEvents>;
type Joined = Ack<{ messages: ChatMessage[] }>;

/** Two api instances: a table's chat reaches its followers on both (POK-104). */
describe("Chat (e2e)", () => {
	let database: TestDatabase;
	const apps: INestApplication<App>[] = [];
	const urls: string[] = [];
	const sockets: Socket[] = [];

	beforeAll(async () => {
		database = await createTestDatabase();
		for (let instance = 0; instance < 2; instance++) {
			const app = await createTestApp({
				config: { database: { url: database.url }, trustProxy: "loopback" },
			});
			await app.listen(0, "127.0.0.1");
			apps.push(app);
			urls.push(await app.getUrl());
		}
	});

	afterAll(async () => {
		for (const socket of sockets) socket.disconnect();
		await Promise.all(apps.map((app) => app.close()));
		await database?.drop();
	});

	let lastAddress = 0;
	const user = async () => {
		const { cookie, userId } = await signedInUser(apps[0]!);
		const ip = `198.22.0.${++lastAddress}`;
		const post = (path: string, body: object = {}) =>
			request(apps[0]!.getHttpServer())
				.post(path)
				.set("Cookie", cookie)
				.set("Origin", WEB_ORIGIN)
				.set("X-Forwarded-For", ip)
				.send(body);
		return { cookie, userId, post };
	};
	type User = Awaited<ReturnType<typeof user>>;

	const table = async (creator: User, visibility: "public" | "private") =>
		(
			(
				await creator
					.post("/api/lobby/tables", {
						name: "Chatty game",
						presetId: "micro",
						maxSeats: 6,
						visibility,
					})
					.expect(201)
			).body as { tableId: string }
		).tableId;

	/** A `/chat` socket that records every message it gets. */
	const chatOn = async (instance: number, { cookie }: User) => {
		const socket = await connectedSocket<ChatSocket>(
			urls[instance]!,
			"/chat",
			cookie,
		);
		sockets.push(socket);
		const received: ChatMessage[] = [];
		socket.on("message", (message) => received.push(message));
		const join = async (tableId: string) =>
			(await socket.emitWithAck("join", {
				tableId: tableId as ChatMessage["tableId"],
			})) as Joined;
		const send = async (tableId: string, text: string) =>
			(await socket.emitWithAck("send", {
				tableId: tableId as ChatMessage["tableId"],
				text,
			})) as Ack<ChatMessage>;
		return { socket, received, join, send };
	};

	it("brings a message to followers on the other instance, and its history to late joiners", async () => {
		const [alice, bob, carol] = [await user(), await user(), await user()];
		const tableId = await table(alice, "public");
		const alices = await chatOn(0, alice);
		const bobs = await chatOn(1, bob);
		expect(await alices.join(tableId)).toEqual({
			ok: true,
			data: { messages: [] },
		});
		await bobs.join(tableId);

		const sent = await alices.send(tableId, "  good luck all  ");

		expect(sent).toEqual({
			ok: true,
			data: {
				kind: "player",
				id: expect.any(String),
				tableId,
				userId: alice.userId,
				nickname: expect.any(String),
				text: "good luck all",
				at: expect.any(String),
			},
		});
		const message = sent.ok ? sent.data : null;
		await vi.waitFor(() => expect(bobs.received).toEqual([message]));
		expect(alices.received).toEqual([message]);

		const carols = await chatOn(1, carol);
		expect(await carols.join(tableId)).toEqual({
			ok: true,
			data: { messages: [message] },
		});
	});

	it("keeps only the last fifty messages", async () => {
		const dave = await user();
		const tableId = await table(dave, "public");
		const history = apps[0]!.get(ChatHistory);
		for (let index = 1; index <= 55; index++) {
			await history.append({
				kind: "player",
				id: randomUUID(),
				tableId,
				userId: dave.userId,
				nickname: "Dave",
				text: `message ${index}`,
				at: new Date().toISOString(),
			});
		}

		const joined = await (await chatOn(1, dave)).join(tableId);

		const texts =
			joined.ok &&
			joined.data.messages.map((message) =>
				message.kind === "player" ? message.text : null,
			);
		expect(texts).toHaveLength(50);
		expect(texts && [texts[0], texts.at(-1)]).toEqual([
			"message 6",
			"message 55",
		]);
	});

	it("masks profanity, refuses a repeat, and throttles a burst", async () => {
		const heidi = await user();
		const tableId = await table(heidi, "public");
		const heidis = await chatOn(0, heidi);
		await heidis.join(tableId);

		expect(await heidis.send(tableId, "ну ты и сyка")).toMatchObject({
			ok: true,
			data: { text: "ну ты и ****" },
		});
		expect(await heidis.send(tableId, "НУ ТЫ И СYКА")).toMatchObject({
			ok: false,
			error: { status: 409, code: "chat.repeated" },
		});
		const burst = [];
		for (let index = 0; index < 5; index++) {
			burst.push(await heidis.send(tableId, `line ${index}`));
		}

		expect(burst.map((answer) => answer.ok)).toEqual([
			true,
			true,
			true,
			false,
			false,
		]);
		expect(burst.at(-1)).toMatchObject({
			ok: false,
			error: { status: 429, code: "chat.too-fast" },
		});
	});

	it("announces who won each pot, as the dealer", async () => {
		const erin = await user();
		const tableId = await table(erin, "public");
		const erins = await chatOn(1, erin);
		await erins.join(tableId);

		apps[0]!
			.get(IntegrationEventBus)
			.publish(
				new PotsAwarded(tableId, "h-1", [
					{ pot: 0, userId: erin.userId, amount: 340, category: "flush" },
				]),
			);

		await vi.waitFor(() =>
			expect(erins.received).toEqual([
				expect.objectContaining({
					kind: "dealer",
					tableId,
					key: "pot-won",
					params: {
						userId: erin.userId,
						nickname: expect.any(String),
						amount: 340,
						category: "flush",
					},
				}),
			]),
		);
	});

	it("is for those with access to the table, who joined its chat, with a verified email", async () => {
		const [frank, grace] = [await user(), await user()];
		const privateId = await table(frank, "private");
		const publicId = await table(frank, "public");
		const graces = await chatOn(0, grace);

		expect(await graces.join(privateId)).toMatchObject({
			ok: false,
			error: { status: 403, code: "chat.access-denied" },
		});
		expect(await graces.send(publicId, "hello?")).toMatchObject({
			ok: false,
			error: { code: "chat.not-joined" },
		});
		await graces.join(publicId);
		expect(await graces.send(publicId, " ")).toMatchObject({
			ok: false,
			error: { code: "chat.invalid-length" },
		});

		await database.db
			.update(users)
			.set({ emailVerified: false })
			.where(eq(users.id, grace.userId));
		expect(await graces.send(publicId, "hello")).toMatchObject({
			ok: false,
			error: { status: 403, code: "auth.email-not-verified" },
		});
	});
});
