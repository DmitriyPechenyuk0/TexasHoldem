import { PotsAwardedV1 } from "../events/index.js";
import { chatNamespace } from "./chat.js";

const tableId = "5d1f8a0e-2b9c-4e7a-8f3d-6c4b2a1e9f07";
const userId = "0b7c6f1e-58a4-4f6b-9a39-5f0f6a8a1c2d";
const id = "9a3b1c2d-4e5f-4a6b-8c7d-0e1f2a3b4c5d";
const at = "2026-11-02T10:00:00.000Z";

describe("chat realtime contracts", () => {
	it("join a table's chat, send to it, and get its messages", () => {
		expect(Object.keys(chatNamespace.clientToServer)).toEqual([
			"join",
			"leave",
			"send",
		]);
		expect(Object.keys(chatNamespace.serverToClient)).toEqual([
			"message",
			"session-expired",
		]);
	});

	it("carry players' words and the dealer's announcements", () => {
		const { payload } = chatNamespace.serverToClient.message;
		const said = {
			kind: "player",
			id,
			tableId,
			userId,
			nickname: "Alice",
			text: "nice hand",
			at,
		};
		const announced = {
			kind: "dealer",
			id,
			tableId,
			key: "pot-won",
			params: { userId, nickname: "Alice", amount: 340, category: "flush" },
			at,
		};

		expect(payload.parse(said)).toEqual(said);
		expect(payload.parse(announced)).toEqual(announced);
		expect(payload.safeParse({ ...announced, key: "gossip" }).success).toBe(
			false,
		);
	});

	it("describe who won each pot of a hand", () => {
		const awarded = {
			tableId,
			handId: "h-1",
			awards: [{ pot: 0, userId, amount: 340, category: null }],
		};
		expect(PotsAwardedV1.parse(awarded)).toEqual(awarded);
		expect(
			PotsAwardedV1.safeParse({
				...awarded,
				awards: [{ pot: 0, userId, amount: 0, category: null }],
			}).success,
		).toBe(false);
	});
});
